# Antigravity IDE Controller for n8n

<img src="nodes/AntigravityController/antigravityController.svg" height="200">

The node for **n8n** that allows you to programmatically control and orchestrate the **Antigravity IDE**. This node uses the Chrome DevTools Protocol (CDP) to inject prompts, manage tasks, and wait for AI agent completion directly within your local development environment.

## 🚀 Key Features

* **Prompt Injection:** Send text or slash commands (e.g., `/start-task`) directly into the Antigravity AI chat.
* **Auto-Focus Logic:** Automatically handles UI state to ensure the chat panel is focused without toggling it closed.
* **Wait for Completion:** Pauses the n8n workflow until the Antigravity agent finishes its task.
* **Clean Output:** Scrapes the final response from the IDE, stripping out CSS and HTML tags for use in downstream nodes.
* **Auto-Start:** Optionally launch the IDE automatically if it isn't already running on the debug port.

---

## 📋 Prerequisites

Before using this node, ensure the following:

1.  **Antigravity IDE Installed:** The IDE must be installed on the same machine running your n8n instance.
2.  **User Logged In:** You must be authenticated within the Antigravity IDE for the agent to function.
3.  **Active Workspace:** A project folder should be open in the IDE so the agent has the necessary context.
4.  **Remote Debugging Enabled:** Ensure Antigravity is started with a remote debugging port (default: `9000`).

---

## 🛠️ Installation

### For Local Development / Manual Install

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/MichaelSpeen/n8n-nodes-antigravity-ide-controller.git](https://github.com/MichaelSpeen/n8n-nodes-antigravity-ide-controller.git)
    cd n8n-nodes-antigravity-controller
    ```

2.  **Install dependencies and build:**
    ```bash
    npm install
    npm run build
    ```

3.  **Link the node globally:**
    ```bash
    npm link
    ```

4.  **Link to your local n8n instance:**
    Navigate to your n8n configuration directory (usually `~/.n8n/` on Linux/Mac or `%USERPROFILE%\.n8n\` on Windows).
    ```bash
    cd ~/.n8n
    mkdir custom
    cd custom
    npm init -y
    npm link n8n-nodes-antigravity-controller
    ```

5.  **Restart n8n:**
    Stop and restart your n8n process to load the new node.

---

## ⚙️ Node Settings

| Parameter | Default | Description |
| :--- | :--- | :--- |
| **Command/Prompt** | `""` | The text or slash command to send to the IDE agent. |
| **Debug Port** | `9000` | The port Antigravity is using for remote debugging. |
| **Auto-Start IDE** | `false` | If enabled, n8n will attempt to launch the IDE if the port is closed. |
| **Executable Path** | `antigravity` | The path to the Antigravity binary (required if Auto-Start is on). |
| **Wait for Completion** | `false` | If enabled, n8n waits for the agent to finish before moving to the next node. |
| **Thinking Selector** | `button[...]` | The CSS selector used to detect if the agent is still working. |

### Note on "Wait for Completion"
The node is pre-configured to watch for the disappearance of the "Cancel" button during generation. The default selector is:
`button[data-tooltip-id="input-send-button-cancel-tooltip"]`

---

## 📖 Example Usage

**Flow:** Jira Trigger → **Antigravity IDE Controller** → Slack

1.  **Jira Trigger:** Detects a new ticket `AX-123`.
2.  **Antigravity Node:** Injects `/start-task AX-123` into the IDE and waits for the agent to finish code changes.
3.  **Slack:** Once the agent is done, n8n grabs the clean text summary from the IDE and posts it to your team's Slack channel.

---

## 📄 License

[MIT](LICENSE)
