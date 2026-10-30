
# Daily GK Quiz Player

**Daily GK** is a high-density, offline evaluation engine and quiz player designed for Visual Studio Code. It renders pre-compiled `.pak` binary question banks with zero CPU layout overhead and native font rasterization.


---

## Features

- **High-Density Engine**: Smoothly loads question banks containing 5,000+ questions without freezing or UI lag.
- **Multiple Layout Modes**:
  - **Single Column Sheet**: Continuous scroll paper view.
  - **Dual-Column Exam Paper**: Two-column layout optimized for wide screens.
  - **Focus Mode**: Single-card question view with keyboard, mouse, and wheel navigation.
- **Multiple Color Themes**: Light Paper (Default), Fluent Blue, Ruby Red, Emerald Green, Imperial Gold, and AMOLED Dark.
- **Interactive Exam Matrix**: Jump to any question index instantly, filter by *All*, *Wrong*, or *Unanswered*, and search questions in real-time.
- **Modes Supported**:
  - **Quiz Mode**: Interactive testing with immediate scoring and final scorecard summary.
  - **Study Mode**: Instant answer visibility for revision and memorization.
- **Offline Storage**: Built-in IndexedDB database stores and remembers your opened `.pak` files for instant reloading.
- **Built-in Demo Generator**: Includes a 10-question demonstration pack to test the engine right away.

---

## Getting Started

1. Open the Command Palette in VS Code:
   - `Ctrl+Shift+P` (Windows / Linux)
   - `Cmd+Shift+P` (macOS)
2. Type and run:
   ```text
   Daily GK: Open Quiz Player
   ```
3. Click **Open Pack** (`Ctrl+O`) to load your `.pak` file, or click **Load Demo** to test with sample questions.

---

## Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| `PageDown` / `Space` | Next question batch |
| `PageUp` | Previous question batch |
| `Left` / `Right` | Previous / Next card (Focus Mode) |
| `Ctrl + J` | Jump to question index |
| `M` | Toggle between Quiz and Study mode |
| `Ctrl + O` | Open `.pak` file from computer |
| `+` / `-` | Zoom in / Zoom out sheet |
| `F1` | Open Technical Architecture guide |
| `Esc` | Close any active modal dialog |

---

## Downloading More `.pak` Packages

You can download official and community question packages directly from:
- **Website**: [https://shifat100.github.io/daily-gk/client-pack.html](https://shifat100.github.io/daily-gk/client-pack.html)

---

## Author & Credits

- **Developer**: Shifat
- **Website**: [https://shifat100.github.io/daily-gk/](https://shifat100.github.io/daily-gk/)
