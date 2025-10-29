# Contributing to FreeKiosk

Thank you for considering contributing to FreeKiosk! 🎉

## How to Contribute

### Reporting Bugs

1. Check if the bug already exists in [Issues](https://github.com/rushb/freekiosk/issues)
2. If not, create a new issue with:
   - **Device model** (e.g., Samsung Galaxy Tab A8)
   - **Android version** (e.g., Android 12)
   - **FreeKiosk version** (e.g., v1.0.1)
   - **Steps to reproduce**
   - **Expected behavior**
   - **Actual behavior**
   - **Screenshots** if applicable

### Suggesting Features

1. Open a feature request issue
2. Describe the feature and its use case
3. Explain why it would benefit users
4. Be open to discussion and feedback

### Code Contributions

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Test** on a real Android device
5. **Commit**: `git commit -m '✨ Add amazing feature'`
6. **Push**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

## Development Setup

Clone repository
git clone https://github.com/rushb-fr/freekiosk.git
cd freekiosk

Install dependencies
npm install

Start Metro bundler
npm start

Run on Android device
npm run android

text

## Code Style

- Use **TypeScript** for all new code
- Follow **React Native** best practices
- Add **comments** for complex logic
- Keep functions **small and focused**
- Use **meaningful variable names**

## Testing

- Test on **real Android device** (not just emulator)
- Test **Device Owner mode** if your changes affect it
- Verify on **multiple Android versions** if possible
- Check for **memory leaks** or performance issues

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `✨ feat: Add new feature`
- `🐛 fix: Fix bug`
- `📝 docs: Update documentation`
- `♻️ refactor: Refactor code`
- `🎨 style: Improve styling`
- `⚡ perf: Performance improvement`
- `✅ test: Add tests`

## Pull Request Guidelines

- Keep PRs **focused** (one feature/fix per PR)
- Update **documentation** if needed
- Add **screenshots** for UI changes
- Reference **issue numbers** if applicable
- Be **responsive** to feedback

## Questions?

Open a [Discussion](https://github.com/rushb-fr/freekiosk/discussions) or email support@freekiosk.app

---

**Thank you for making FreeKiosk better! 🚀**

*— The Rushb Team*