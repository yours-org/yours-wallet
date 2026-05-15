## Contributing to Yours Wallet

Thank you for your interest in contributing to Yours Wallet! Your contributions are what move the project forward.

## Getting Started

1. **Fork the Repository:** Click the "Fork" button at the top right of this repository on GitHub.

2. **Clone Your Fork:**

```bash
git clone https://github.com/your-username/yours-wallet.git
cd yours-wallet
```

3. **Install Dependencies:**

```bash
bun install
```

4. **Create a Branch:**

```bash
git checkout -b feat/75-add-new-card-component
```

5. **Build the App:**

```bash
bun run build
```

6. **Load the Extension:**
   - Navigate to `chrome://extensions/` and enable **Developer mode** (top right toggle).
   - Click **Load unpacked** and select the `build/` folder.
   - **Important:** If you have the production Yours Wallet from the Chrome Web Store, disable it first to avoid conflicts.

7. **Format and Commit:**

```bash
bun run format
git add .
git commit -m "Your descriptive commit message"
```

The pre-commit hook runs Prettier automatically. If the commit fails, run `bun run format` and try again.

8. **Push and Create a Pull Request:**

```bash
git push origin my-feature
```

Navigate to your fork on GitHub and create a pull request into `yours-org/yours-wallet:main`.

## Using AI Agents

For a comprehensive guide to the codebase architecture, conventions, and common patterns, see [Contributing with Agents](docs/contributing-with-agents.md). Point your AI coding assistant at that doc to help fix bugs or implement features.
