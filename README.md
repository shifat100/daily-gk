# Daily GK MCQ 📚

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20PWA%20%7C%20Android-green.svg)](#)
[![Tech Stack](https://img.shields.io/badge/Stack-Vanilla%20HTML5%20%2F%20CSS3%20%2F%20JS-orange.svg)](#)

> A modern, ultra-fast, zero-dependency Progressive Web Application (PWA) designed with **Android Material Design 3 (MD3)** for practicing General Knowledge (GK) and preparing for competitive exams.

---

## 🌟 Overview

**Daily GK** is a lightweight, serverless educational web platform that allows users to practice thousands of multiple-choice questions (MCQs) covering General Science, Geography, History, Information Technology, and Current Affairs.

Built with pure Vanilla HTML5, CSS3, and JavaScript, it runs completely client-side right inside any modern web browser—**no installation, backend server, or build step required.**

---

## 🚀 Live Demo & Links

- 🌐 **Live Web App:** [https://shifat100.github.io/daily-gk/](https://shifat100.github.io/daily-gk/)
- ⚡ **Old Version:** [https://shifat100.github.io/daily-gk/index1.html](https://shifat100.github.io/daily-gk/index1.html)

---

## ✨ Key Features

### 🎯 1. Interactive Practice Modes
- **Quiz Mode:** Interactive MCQ practice with immediate visual feedback (Correct/Wrong) and detailed expandable explanations.
- **Study Mode:** Read and review questions directly with pre-highlighted correct answers and explanation cards.
- **Exam Mode:** Simulates real-world test environments with a live countdown timer, answer selection state, and an automated scorecard *(Correct, Wrong, and Skipped counts)* upon submission.

### 🛠️ 2. Productivity & Study Utilities
- 🔊 **Text-to-Speech (TTS):** Built-in native speech synthesis that reads out questions and options aloud.
- 📑 **Bookmarks / Saved Questions:** Save important questions locally with one click; filter saved lists, or **Export/Download them as a `.txt` file** for offline study.
- 🖨️ **Advanced Print Engine:** Formatted print options including:
  - *Simple List*
  - *2x2 Options Grid*
  - *2-Column Competitive Exam Layout*
- 🔍 **Real-Time Search & Filtering:** Debounced search bar, category/topic tree navigation with badge counters, question shuffling, ascending/descending sorting, and customizable items per page.

### 🎨 3. Android Native Material You (MD3) UX
- **Mobile-First App Shell:** Features a slide-over modal Navigation Drawer, docked bottom navigation, floating action buttons (FAB), and Material You color tokens.
- **Responsive Layout:** Flexbox Viewport Grid (`100dvh`) ensures no content or buttons are cut off on mobile viewports.
- **Dark / Light Theme:** Instant theme switcher with persistent local storage saving.
- **Vector Icons:** 100% clean, crisp SVG icons across the interface (no emojis).

### 📱 4. Multi-Platform Support & PWA
- **Installable PWA:** Install directly to your home screen or desktop via native browser prompts.
- **Cross-Platform Downloads:** Includes direct download access for:
  - 🤖 Android (`.apk`)
  - 🪟 Windows (`.bat`)
  - 🐧 Linux (`.sh`)
  - ☕ Java J2ME (`.jar`)
  - 🟣 KaiOS Store
  - 📱 MRE Feature Phones (`.vbm`)

### ⚡ 5. Performance & Security
- **Zero Dependencies:** Pure vanilla code without heavy frameworks or external libraries.
- **Incremental Data Loader:** Dynamic asynchronous loading with instant fallback demo dataset.
- **Focus & Integrity:** Built-in safeguards including right-click protection, developer tool shortcuts blocking, and automatic background tab blur.

---

## 📂 Project Architecture

```plaintext
daily-gk/
├── index.html           # Standalone single-file application (HTML, CSS, JS)
├── fastmode.html        # Lightweight high-speed alternate view
├── manifest.json        # PWA Web App Manifest
├── sw.js                # Service Worker for offline support & caching
├── data/                # Question bank datasets (JSON / Text)
│   ├── main.json
│   └── ...
├── app-release.apk      # Native Android APK package
├── Daily-GK.bat         # Windows launcher
├── Daily-GK.sh          # Linux shell launcher
├── Daily-GK.jar         # J2ME Java application
├── Daily-GK.vbm         # MRE feature phone binary
└── README.md            # Project documentation
```

---

## 💻 How to Run Locally

Because Daily GK is completely client-side, running it is effortless:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/shifat100/daily-gk.git
   ```
2. **Navigate to the directory:**
   ```bash
   cd daily-gk
   ```
3. **Open `index.html`:**
   Double-click `index.html` or open it with any web browser (Chrome, Edge, Firefox, Safari).

*Tip: For testing Service Workers (PWA) locally, serve using Live Server (VS Code) or Python:*
```bash
python3 -m http.server 8000
```

---

## 🤝 Contributing

Contributions, question bank additions, bug reports, and feature requests are welcome!

1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/NewTopicQuestions`).
3. Commit your Changes (`git commit -m 'Add: World History MCQs'`).
4. Push to the Branch (`git push origin feature/NewTopicQuestions`).
5. Open a Pull Request.

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

## 👨‍💻 Author & Acknowledgments

- **Developer:** [A.I. Shifat](https://github.com/shifat100)
- **Project:** [Daily GK MCQ](https://shifat100.github.io/daily-gk/)
