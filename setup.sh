#!/bin/bash

# Install Husky and configure pre-commit hooks
npx husky install

# Make the pre-commit hook executable
chmod +x .husky/pre-commit

# Display a message to let contributors know it's set up
echo "Husky hooks configured. You're ready to start contributing!"