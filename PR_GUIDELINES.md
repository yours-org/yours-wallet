## Pull Request (PR) Guidelines

1. **Small and Focused Changes:**
   - PRs should focus on addressing a specific issue, implementing a single feature, or fixing a bug. Keep changes small and avoid bundling unrelated changes in the same PR.

2. **Branch Naming Convention:**
   - Use descriptive branch names that reflect the purpose of the PR. For example, use `feature/add-authentication` or `bugfix/fix-login-issue`.

3. **Code Quality:**
   - Ensure your code follows the project's coding style and conventions.
   - Run linters and code formatters before submitting a PR to maintain code quality.

4. **Test Coverage:**
   - Write tests for new features or changes to ensure they work as expected.
   - Ensure existing tests continue to pass with your changes.

5. **Documentation:**
   - Update documentation to reflect any changes made in the PR.
   - Include code comments where necessary to explain complex logic.

6. **Commit Messages:**
   - Write clear and concise commit messages that explain the purpose of each commit.
   - Use a conventional format like "feat(ordinal): implement transfers" or "fix(service-worker): resolve issue with listener."

7. **Rebase and Resolve Conflicts:**
   - Before merging, ensure your PR is up-to-date with the latest changes from the main branch. Resolve any conflicts that arise during the rebase.

8. **Peer Review:**
   - Request a code review from one or more maintainers.
   - Reviewers should provide constructive feedback and check for code quality, functionality, and adherence to project standards.

9. **CI/CD Checks:**
   - Ensure any continuous integration (CI) tests pass successfully.
   - Make sure the code builds and deploys correctly in the target environment.

10. **Use Labels and Milestones:**
    - Apply labels to categorize PRs (e.g., bug, feature, documentation).
    - Associate PRs with project milestones when applicable.

11. **Avoid Force Pushing:**
    - Once a PR is open, avoid force-pushing changes to the branch. If you need to update the PR, make new commits.

12. **Ownership and Responsibility:**
    - Assign the PR to the person responsible for reviewing and merging it.
    - Authors should address feedback promptly and engage in the review process.

13. **Merging:**
    - PRs should be merged after receiving approval from reviewers and passing all checks.

14. **Delete Branches:**
    - After a successful merge, delete the feature or bugfix branch unless it's a long-lived branch or follows a specific naming convention (e.g., `release/1.0`).

15. **Changelog Updates:**
    - If your project maintains a changelog, update it with changes introduced in the PR.

16. **Security and Compliance:**
    - Consider security implications in your code changes.

17. **Communication:**
    - Provide context and any relevant information in the PR description.
