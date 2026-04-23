import { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
import * as http from 'http';

// Helper function moved OUTSIDE the class to avoid 'this' context errors
async function isPortOpen(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		// Explicitly use 127.0.0.1 to bypass Node's IPv6 localhost resolution bug
		const req = http.get(`http://127.0.0.1:${port}/json`, (res) => {
			resolve(res.statusCode === 200);
		});

		req.on('error', () => resolve(false));
		
		req.setTimeout(1000, () => {
			req.destroy();
			resolve(false);
		});
	});
}

export class AntigravityController implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Antigravity IDE Controller',
		name: 'antigravityController',
		icon: 'file:antigravityController.svg',
		group: ['transform'],
		version: 1,
		description: 'Inject commands directly into a local Antigravity IDE via CDP',
		defaults: {
			name: 'Antigravity IDE Controller',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Command/Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: { alwaysOpenEditWindow: true },
				default: '',
				description: 'The text or slash command to inject (e.g., /start-task AX-1234)',
				required: true,
			},
			{
				displayName: 'Debug Port',
				name: 'port',
				type: 'number',
				default: 9000,
				description: 'The Chrome DevTools Protocol port Antigravity is running on',
			},
			{
				displayName: 'Auto-Start IDE',
				name: 'autoStart',
				type: 'boolean',
				default: false, // <-- Updated to false by default
				description: 'Whether to automatically launch Antigravity if the port is closed',
			},
			{
				displayName: 'Executable Path',
				name: 'executablePath',
				type: 'string',
				displayOptions: { show: { autoStart: [true] } },
				default: 'antigravity',
				description: 'The CLI command or absolute path to the Antigravity executable',
			},
			{
				displayName: 'Wait for Completion',
				name: 'waitForCompletion',
				type: 'boolean',
				default: false,
				description: 'Whether n8n should pause execution until the IDE finishes the task',
			},
			{
				displayName: 'Thinking Indicator CSS Selector',
				name: 'thinkingSelector',
				type: 'string',
				displayOptions: { show: { waitForCompletion: [true] } },
				default: 'button[data-tooltip-id="input-send-button-cancel-tooltip"]',
				description: 'The CSS selector of the element that appears while the agent is working. The node will wait until this element disappears.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const prompt = this.getNodeParameter('prompt', i) as string;
			const port = this.getNodeParameter('port', i) as number;
			const autoStart = this.getNodeParameter('autoStart', i) as boolean;

			try {
				let isReady = await isPortOpen(port);

				if (!isReady && autoStart) {
					const executablePath = this.getNodeParameter('executablePath', i) as string;
					console.log(`Port ${port} closed. Starting Antigravity...`);
					
					const child = spawn(executablePath, [`--remote-debugging-port=${port}`], {
						detached: true,
						stdio: 'ignore',
						shell: true 
					});
					child.unref(); 

					let retries = 15;
					while (retries > 0 && !isReady) {
						await new Promise(resolve => setTimeout(resolve, 1000));
						isReady = await isPortOpen(port);
						retries--;
					}

					if (!isReady) {
						throw new Error(`Started IDE, but port ${port} never opened after 15 seconds.`);
					}
				} else if (!isReady) {
					throw new Error(`Antigravity is not running on port ${port} and Auto-Start is disabled.`);
				}

				const browser = await puppeteer.connect({
					// Hardcoding 127.0.0.1 forces Puppeteer to bypass Node's buggy DNS resolution
					browserURL: `http://127.0.0.1:${port}`,
					defaultViewport: null,
				});

				const pages = await browser.pages();
				const idePage = pages.find((p) => p.url().includes('workbench.html') && !p.url().includes('jetski-agent'));

				if (!idePage) {
					throw new Error('Could not find the main Antigravity workspace window.');
				}

				await idePage.bringToFront();

				// Normalize UI State: Force focus to the main editor group first (Ctrl + 1)
				await idePage.keyboard.down('Control');
				await idePage.keyboard.press('1');
				await idePage.keyboard.up('Control');

				await new Promise((resolve) => setTimeout(resolve, 300));

				// Open/Focus the AI Chat (Ctrl + L)
				await idePage.keyboard.down('Control');
				await idePage.keyboard.press('l');
				await idePage.keyboard.up('Control');
				
				await new Promise((resolve) => setTimeout(resolve, 1000));
				
				// Inject the prompt
				await idePage.keyboard.type(prompt, { delay: 5 });
				await idePage.keyboard.press('Enter');

				// Wait for Completion Logic
				const waitForCompletion = this.getNodeParameter('waitForCompletion', i) as boolean;
				let finalReply = 'Task executed (Wait for Completion disabled)';
				
				if (waitForCompletion) {
					const thinkingSelector = this.getNodeParameter('thinkingSelector', i) as string;
					console.log(`Waiting for agent to finish. Watching for disappearance of: ${thinkingSelector}`);
					
					// Pause for 1.5 seconds to give the IDE UI time to render the "Stop" button/spinner
					await new Promise(r => setTimeout(r, 1500));

					// Wait indefinitely for the element to be hidden or removed
					await idePage.waitForSelector(thinkingSelector, { 
						hidden: true, 
						timeout: 0 
					});
					
					console.log("Agent finished. Extracting final message...");

					// Extract the clean text from the last chat bubble
					finalReply = await idePage.evaluate(() => {
						// 1. Grab document dynamically to bypass TypeScript Node checks
						const browserDoc = (globalThis as any).document;
						
						// 2. Query the chat bubbles
						const messageBubbles = browserDoc.querySelectorAll('.leading-relaxed');
						if (!messageBubbles || messageBubbles.length === 0) {
							return 'No messages found in the chat UI.';
						}

						// 3. Target the very last message in the chat
						const lastBubble = messageBubbles[messageBubbles.length - 1] as any;

						// 4. Clone it so we don't accidentally break the live UI when stripping tags
						const clone = lastBubble.cloneNode(true) as any;

						// 5. Strip out all <style> or <script> tags
						const hiddenTags = clone.querySelectorAll('style, script');
						hiddenTags.forEach((tag: any) => tag.remove());

						// 6. Extract the clean text
						return clone.innerText.trim();
					});
				}

				await browser.disconnect();

				returnData.push({
					json: { 
						success: true, 
						injectedPrompt: prompt,
						output: finalReply
					},
				});

			} catch (error: any) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: error.message } });
					continue;
				}
				throw error;
			}
		}
		return [returnData];
	}
}