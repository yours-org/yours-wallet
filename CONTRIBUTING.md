## Contributing to Yours Wallet

Thank you for your interest in contributing to Yours Wallet! Your contributions are what move the project forward. Please follow these steps to set up your development environment and ensure that your code adheres to our formatting standards.

## Getting Started

1. **Fork the Repository:** Click the "Fork" button at the top right of this repository on GitHub to create a copy of the repository under your own GitHub account.

2. **Clone Your Fork:** Clone the repository from your GitHub account to your local machine.

```bash
git clone https://github.com/your-username/your-repo.git
cd your-repo
```

3. **Install Dependencies:** Install the projects dependencies using npm.

```bash
npm install
```

4. **Setup Husky Hooks:** Run the setup script to enable Husky hooks and configure pre-commit hooks for code formatting. This script will also make the pre-commit hook executable.

```bash
./setup.sh
```

5. **Create a Branch:** Create a new branch for your work. Please ensure that your branch includes the issue number and a description like so:

```bash
git checkout -b feat/75-add-new-card-component
```

6. **Build the App:** Save your changes then create a production build of the app to ensure it compiles correctly.

```bash
npm run build
```

7. **Run The Extension:** Load the extension into your browser using dev mode and ensure your changes look good in the chrome environment:

   - Navigate to `chrome://extensions` and turn on dev mode.
   - Click "Load Unpacked".
   - Upload the production `build` folder that was just created.
   - Launch the extension and ensure your changes look good.

8. **Commit Your Changes:** Assuming everything above checks out, commit your changes. Husky will automatically run Prettier to format your code, ensuring it meets our formatting standards.

```bash
git add .
git commit -m "Your descriptive commit message"
```

9. **Push Changes:** Push the branch to your GitHub fork.

```bash
git push origin my-feature
```

10. **Create a Pull Request:**: Navigate to your forked repository on GitHub, and you should see an option to create a pull request and merge into `Yours-Wallet:main`. Click it, fill out the pull request template, and submit your changes for review.

11. **Code Review:** Your changes will be reviewed, and you may be asked to make further adjustments. Once the changes are approved, they will be merged into the main project.

12. **Celebrate:** 🎉 Congratulations, you've contributed to Yours Wallet!

**\*If you plan to contribute, please review the PR Guidelines**

[PR Guidelines](PR_GUIDELINES.md)
