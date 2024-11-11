const { TwitterApi } = require('twitter-api-v2');
const OpenAI = require('openai');
const express = require('express');
const session = require('express-session');
require('dotenv').config();

class ReactAIBot {
	constructor() {
		this.twitterClient = new TwitterApi({
			clientId: process.env.TWITTER_CLIENT_ID,
			clientSecret: process.env.TWITTER_CLIENT_SECRET,
		});

		this.openai = new OpenAI({
			apiKey: process.env.OPENAI_API_KEY,
		});

		this.lastMentionId = null;
	}

	async generateTweetContent() {
		try {
			const prompt = `Generate a short, engaging tweet (max 280 characters) about either ReactJS or AI technology. 
                           Focus on recent trends, best practices, or interesting insights.
                           Include relevant hashtags like #ReactJS, #AI, #WebDev.
                           Make it informative and professional.`;

			const completion = await this.openai.chat.completions.create({
				model: "gpt-4",
				messages: [{
					role: "system",
					content: "You are a tech influencer specializing in ReactJS and AI technologies."
				}, {
					role: "user",
					content: prompt
				}],
				max_tokens: 100,
				temperature: 0.7
			});

			return completion.choices[0].message.content.trim();
		} catch (error) {
			console.error('Error generating tweet content:', error);
			throw error;
		}
	}

	async generateResponse(comment) {
		try {
			const prompt = `Analyze this comment and generate a helpful, professional response (max 280 characters):
                           "${comment}"
                           If it's a question, provide accurate information.
                           If it's feedback, acknowledge it appropriately.
                           Include relevant React/AI context if applicable.`;

			const completion = await this.openai.chat.completions.create({
				model: "gpt-4",
				messages: [{
					role: "system",
					content: "You are a knowledgeable tech expert in ReactJS and AI. Provide helpful, accurate responses."
				}, {
					role: "user",
					content: prompt
				}],
				max_tokens: 100,
				temperature: 0.7
			});

			return completion.choices[0].message.content.trim();
		} catch (error) {
			console.error('Error generating response:', error);
			throw error;
		}
	}

	async getTechNews() {
		try {
			const prompt = `Summarize a current trend or development in either ReactJS or AI (max 280 characters).
                           Focus on practical implications and real-world applications.
                           Include relevant hashtags.`;

			const completion = await this.openai.chat.completions.create({
				model: "gpt-4",
				messages: [{
					role: "system",
					content: "You are a tech news curator focusing on ReactJS and AI developments."
				}, {
					role: "user",
					content: prompt
				}],
				max_tokens: 100,
				temperature: 0.7
			});

			return completion.choices[0].message.content.trim();
		} catch (error) {
			console.error('Error getting tech news:', error);
			throw error;
		}
	}

	async postTweet(content) {
		try {
			if (!this.authenticatedClient) {
				throw new Error('Twitter client not authenticated. Please visit /auth endpoint first.');
			}

			const tweet = await this.authenticatedClient.v2.tweet(content);
			console.info(`Posted tweet: ${content}`);
			return tweet;
		} catch (error) {
			console.error('Error posting tweet:', error);
			throw error;
		}
	}

	async handleMentions() {
		try {
			const mentions = await this.twitterClient.v2.mentions({
				since_id: this.lastMentionId,
				max_results: 100,
				"tweet.fields": ["text", "author_id", "conversation_id"]
			});

			for (const mention of mentions.data || []) {
				const response = await this.generateResponse(mention.text);
				await this.twitterClient.v2.reply(response, mention.id);
				console.info(`Responded to mention ${mention.id}`);
				this.lastMentionId = mention.id;
			}
		} catch (error) {
			console.error('Error handling mentions:', error);
		}
	}

	async initializeTwitterAuth() {
		const app = express();

		app.use(
			session({
				secret: 'your-secret-key',
				resave: false,
				saveUninitialized: true,
				cookie: {
					secure: false,
					httpOnly: false,
				},
			})
		);

		let accessToken = null;
		let codeVerifier = null;

		app.get('/callback', async (req, res) => {
			try {
				const { code } = req.query;

				const { accessToken: token } = await this.twitterClient.loginWithOAuth2({
					code,
					codeVerifier,
					redirectUri: `${process.env.APP_URL}/callback`,
				});

				accessToken = token;
				this.authenticatedClient = new TwitterApi(accessToken);

				res.send('Authentication successful! You can close this window.');
			} catch (error) {
				console.error('Auth Error:', error);
				res.status(500).send('Authentication failed');
			}
		});

		app.get('/auth', async (req, res) => {
			const { url, codeVerifier: code } = this.twitterClient.generateOAuth2AuthLink(
				`${process.env.APP_URL}/callback`,
				{ scope: ['tweet.read', 'tweet.write', 'users.read'] }
			);
			codeVerifier = code;

			res.redirect(url);
		});

		const port = process.env.PORT || 3000;

		app.listen(port, () => {
			console.log(`Server running on port ${port}`);
			console.log(`Please visit ${process.env.APP_URL}/auth to authenticate`);
		});
	}

	async startBot() {
		await this.initializeTwitterAuth();

		const app = express();
		app.get('/health', (req, res) => res.status(200).send('Bot is running'));

		setInterval(async () => {
			try {
				if (this.authenticatedClient) {
					const content = Math.random() > 0.5 ?
						await this.generateTweetContent() :
						await this.getTechNews();

					await this.postTweet(content);
				}
			} catch (error) {
				console.error('Error in main bot loop:', error);
			}
		}, 3600000);

		console.info('Bot started successfully');
	}
}

const bot = new ReactAIBot();

bot.startBot().catch(error => {
	console.error('Failed to start bot:', error);
	process.exit(1);
});