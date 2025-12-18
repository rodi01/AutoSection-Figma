# AutoSection

> Automatically create and manage Figma Sections with consistent padding, spacing, and layout.

![AutoSection Cover](<!-- TODO: Add cover image path -->)

**By [Rodrigo Soares](https://github.com/rsoares)**, creator of [Rename It](https://www.figma.com/community/plugin/731271836271143349/rename-it) — one of the most popular Figma plugins.

---

## Features

- **Create Section** — Select frames and instantly wrap them in a Section with customizable padding and spacing
- **Update Section** — Modify an existing Section's padding, spacing, layout, and alignment
- **Refresh Section** — Quickly re-apply stored settings to a Section (no UI needed)
- **Update All Sections** — Batch update all Sections on the current page that were created with AutoSection
- **Presets** — Save your favorite configurations and apply them with one click
- **Smart Detection** — Automatically detects spacing and layout direction from your selection
- **Dark Mode Support** — UI adapts to Figma's light and dark themes

---

## Installation

### From Figma Community

1. Visit the [AutoSection plugin page](<!-- TODO: Add Figma Community URL -->)
2. Click **"Try it out"** or **"Save"**
3. Access it from **Plugins → AutoSection** in any Figma file

### For Development

See the [Development](#development) section below.

---

## Usage

### Create Section

1. Select one or more frames in your Figma canvas
2. Run **Plugins → AutoSection → Create Section**
3. Configure your settings:
   - **Preset** — Choose a saved preset or use Default
   - **Layout Direction** — Horizontal, Vertical, or Maintain positions
   - **Section Padding** — Horizontal and vertical padding values
   - **Items Gap** — Spacing between frames
   - **Alignment** — Align frames within the Section
4. Click **Apply**

![Create Section UI](<!-- TODO: Add screenshot path -->)

### Update Section

1. Select a Section (or any element inside a Section)
2. Run **Plugins → AutoSection → Update Section**
3. Modify the settings as needed
4. Click **Apply**

The plugin remembers each Section's settings, so your values are preserved when you update.

### Refresh Section

1. Select a Section that was created/updated with AutoSection
2. Run **Plugins → AutoSection → Refresh Section**

This instantly re-applies the stored settings without showing the UI — perfect for keyboard shortcuts!

### Update All Sections

1. Run **Plugins → AutoSection → Update All Sections**

This updates every Section on the current page that has stored AutoSection settings.

---

## Presets

Save your commonly used configurations as presets for quick access.

![Presets Dropdown](<!-- TODO: Add screenshot path -->)

### Managing Presets

- **Save a Preset** — Click the **+** button or select "Save As New Preset..." from the dropdown
- **Apply a Preset** — Select it from the dropdown; settings are applied immediately
- **Update a Preset** — With a preset selected, choose "Update [preset name]" from the dropdown
- **Delete a Preset** — Hover over a preset in the dropdown and click the trash icon

The **Default** preset cannot be deleted and provides standard values (80px padding, 0 gap, horizontal layout).

---

## Screenshots

### Plugin Interface

![Plugin UI](<!-- TODO: Add UI screenshot -->)

### Before & After

| Before | After |
|--------|-------|
| ![Before](<!-- TODO: Add before screenshot -->) | ![After](<!-- TODO: Add after screenshot -->) |

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [TypeScript](https://www.typescriptlang.org/)

### Setup

```bash
# Clone the repository
git clone https://github.com/rsoares/autosection.git
cd autosection

# Install dependencies
npm install

# Watch for changes (compiles TypeScript)
npm run watch
```

### Loading in Figma

1. Open Figma Desktop
2. Go to **Plugins → Development → Import plugin from manifest...**
3. Select the `manifest.json` file from this project
4. The plugin will appear under **Plugins → Development → AutoSection**

### Project Structure

```
AutoSection/
├── code.ts          # Main plugin logic
├── ui.html          # Plugin UI (HTML/CSS/JS)
├── manifest.json    # Figma plugin manifest
├── package.json     # Node.js dependencies
├── tsconfig.json    # TypeScript configuration
└── Assets/          # SVG icons used in the UI
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Author

**Rodrigo Soares**

- [Rename It](https://www.figma.com/community/plugin/731271836271143349/rename-it) — Batch rename layers with ease
- [GitHub](https://github.com/rsoares)

---

Made with ❤️ for the Figma community
