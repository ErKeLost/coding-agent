# Daytona Code Execution Agent

An advanced Mastra template that provides a coding agent capable of planning, writing, executing, and iterating on code in secure, isolated Daytona sandboxes with comprehensive file management and development workflow capabilities.

## Overview

This template demonstrates how to build an AI coding assistant that can work with real development environments. The agent can create sandboxes, manage files and directories, execute code in multiple languages, and monitor development workflows - all within secure, isolated Daytona environments.
The default workspace root is `/workspace`, which ships with a Vite project template.

## Features

- **Secure Code Execution**: Run Python, JavaScript, and TypeScript code in isolated Daytona sandboxes
- **Complete File Management**: Create, read, write, delete files and directories with batch operations
- **Multi-Language Support**: Execute code in Python, JavaScript, and TypeScript environments
- **Live Development Monitoring**: Watch directory changes and monitor development workflows
- **Command Execution**: Run shell commands, install packages, and manage dependencies
- **Memory System**: Persistent conversation memory with semantic recall and working memory
- **Development Workflows**: Professional development patterns with build automation

## Prerequisites

- Node.js 20 or higher
- Daytona API key (sign up at [daytona.io](https://www.daytona.io))
- OpenAI or OpenRouter API key

## Setup

1. **Clone and install dependencies:**

   ```bash
   git clone https://github.com/mastra-ai/template-coding-agent.git
   cd template-coding-agent
   pnpm install
   ```

2. **Set up environment variables:**

   ```bash
   cp .env.example .env
   # Edit .env and add your API keys
   ```

   ```env
   DAYTONA_API_KEY="dtn_51adb0882b181cee8934958d16aa38e009092394a57507e951e6162cb0a6ca84"
   DAYTONA_SNAPSHOT="howone-template"
   DAYTONA_AUTO_STOP_SECONDS="300"
   OPENAI_API_KEY="your-openai-api-key-here"
   # If using OpenRouter:
   OPENROUTER_API_KEY="your-openrouter-api-key-here"
   OPENAI_BASE_URL="https://openrouter.ai/api/v1"
   TAVILY_API_KEY="your-tavily-api-key-here"
   ```

3. **Start the development server:**

   ```bash
   pnpm run dev
   ```

## Desktop Shell

This project now includes a minimal Tauri shell for local desktop development.

1. Make sure Rust is installed on your machine.
2. Start the desktop shell:

   ```bash
   bun run desktop:dev
   ```

This opens a native Tauri window that points at the local Next.js dev server on
`http://localhost:3000`.

Current scope:

- `desktop:dev` is wired for local development.
- `desktop:build` only packages a placeholder frontend for now.
- A production-ready bundled Next.js sidecar has not been wired yet.

## Architecture

### Core Components

#### **Build Agent** (`src/mastra/agents/build-agent.ts`)

The primary agent with comprehensive development capabilities:

- **Sandbox Management**: Creates and manages isolated execution environments
- **Code Execution**: Runs code with real-time output capture
- **File Operations**: Complete CRUD operations for files and directories
- **Development Monitoring**: Watches for changes and monitors workflows
- **Memory Integration**: Maintains conversation context and project history

#### **Daytona Tools** (`src/mastra/tools/daytona.ts`)

Complete toolkit for sandbox interaction:

**Sandbox Management:**

- `createSandbox` - Initialize new isolated environments
- Connection management with timeout handling

**Code Execution:**

- `runCode` - Execute Python, JavaScript, TypeScript code
- Real-time output capture and error handling
- Environment variable and timeout configuration

**File Operations:**

- `writeFile` - Create individual files
- `writeFiles` - Batch create multiple files for project setup
- `readFile` - Read file contents for analysis and validation
- `listFiles` - Explore directory structures
- `deleteFile` - Clean up files and directories
- `createDirectory` - Set up project structures

**File Information & Monitoring:**

- `getFileInfo` - Get detailed file metadata
- `checkFileExists` - Validate file existence for conditional logic
- `getFileSize` - Monitor file sizes and track changes
- `watchDirectory` - Live monitoring of file system changes

**Development Workflow:**

- `runCommand` - Execute shell commands, build scripts, package management

**Web Search:**

- `webSearch` - Live web search via Tavily

### Memory System

The agent includes a configured memory system:

- **Thread Management**: Automatic conversation title generation
- **Semantic Recall**: Search through previous interactions
- **Working Memory**: Maintains context across interactions
- **Vector Storage**: Semantic search capabilities with `LibSQLVector`

## Configuration

### Environment Variables

```bash
DAYTONA_API_KEY=dtn_51adb0882b181cee8934958d16aa38e009092394a57507e951e6162cb0a6ca84
DAYTONA_SNAPSHOT=howone-template
DAYTONA_AUTO_STOP_SECONDS=300
OPENAI_API_KEY=your_openai_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENAI_BASE_URL=https://openrouter.ai/api/v1
TAVILY_API_KEY=your_tavily_api_key_here
```

### Customization

You can customize the agent behavior by modifying the instructions in `src/mastra/agents/build-agent.ts`:

```typescript
export const buildAgent = new Agent({
  name: 'Build Agent',
  instructions: `
  // Customize agent instructions here
    // Focus on specific languages, frameworks, or development patterns
  `,
  model: 'openrouter/openai/gpt-4o',
  // ... other configuration
});
```

## Common Issues

### "DAYTONA_API_KEY is not set"

- Make sure you've set the environment variable
- Check that your API key is valid and has sufficient credits
- Verify your Daytona account is properly configured

### "Sandbox creation failed"

- Check your Daytona API key and account status
- Ensure you haven't exceeded sandbox limits
- Verify network connectivity to Daytona services

### "Code execution timeout"

- Increase timeout values for long-running operations
- Break down complex operations into smaller steps
- Monitor resource usage and optimize code

### "File operation errors"

- Validate file paths and permissions
- Check sandbox file system limits
- Ensure directories exist before file operations

### "Agent stopping with tool-call reason"

- Increase `maxSteps` in the agent configuration

## Development

### Project Structure

```text
src/mastra/
      agents/
        build-agent.ts               # Primary build agent with development capabilities
      tools/
        daytona.ts                  # Complete Daytona sandbox interaction toolkit
      index.ts                        # Mastra configuration with storage and logging
```
