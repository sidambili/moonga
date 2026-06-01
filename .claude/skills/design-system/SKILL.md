---
name: design-system
description: Guidelines for building, styling, and using UI components in the frontend. Use when working on .tsx/.css files in apps/frontend, adding or modifying components, or implementing UI features. Triggers for component architecture, styling, UI changes, motion, accessibility, or feature work.
---

# Design System

Comprehensive guide for building, styling, and using components in the frontend.

## When to Apply

Reference these guidelines when:
- Working on `.{tsx|css}` files in `apps/frontend/src`
- Adding new components to `apps/frontend/src/components/ui`
- Refactoring styles for React components
- Implementing new UI components or features
- Adding animations, transitions, or motion
- Reviewing changes to UI

## Tokens & Styling

- **ALWAYS** use CSS variables for colors and tokens from `apps/frontend/src/index.css`. Use hard-coded values only when no suitable token exists.
- Key tokens include: `--color-background`, `--color-foreground`, `--color-primary`, `--color-secondary`, `--color-muted`, `--color-accent`, `--color-destructive`, `--color-border`, `--color-ring`, `--color-card`, `--color-popover`.
- Status tokens: `--status-critical`, `--status-high`, `--status-medium`, `--status-low`.
- Use `var(--radius)`, `var(--radius-sm)`, `var(--radius-md)`, `var(--radius-lg)`, `var(--radius-xl)` for border radius.
- Font families: `--font-sans` (Inter) and `--font-mono` (SF Mono / Fira Code).
- Dark mode is toggled via the `.dark` class on the root element.
- The project uses **Tailwind CSS v4** with `@import "tailwindcss"` and `@theme inline` for theme mapping. Do not use a traditional `tailwind.config.ts`.

## Components

- **ALWAYS** prefer using existing components from `apps/frontend/src/components/ui`. These are shadcn/ui New York style components customized for this project.
- Available primitives: `Button`, `Input`, `Textarea`, `Dialog`, `Sheet`, `Card`, `Badge`, `Avatar`, `Select`, `DropdownMenu`, `Popover`, `Tooltip`, `Tabs`, `Accordion`, `Checkbox`, `RadioGroup`, `Switch`, `Slider`, `ScrollArea`, `Separator`, `Skeleton`, `Spinner`, `Command`, `Calendar`, `Table`, `Form`, `Label`, `Breadcrumb`, `Pagination`, `Carousel`, `Chart`, `Drawer`, `HoverCard`, `Collapsible`, `Resizable`, `Toggle`, `ToggleGroup`, `Menubar`, `NavigationMenu`, `ContextMenu`, `Alert`, `AlertDialog`, `AspectRatio`, `Progress`, `Sonner`, `Toast`, `Kbd`, `Empty`, `Field`, `Item`, `InputGroup`.
- Compose complex UIs from these primitives rather than one-off custom elements.
- Use the `cn()` utility from `@/lib/utils` (combines `clsx` and `tailwind-merge`) for conditional class merging. Never concatenate Tailwind classes manually.
- Use `class-variance-authority` (`cva`) when a component needs style variants (e.g., `buttonVariants`, `badgeVariants`).
- Follow the `data-slot` attribute convention used across the codebase (e.g., `data-slot="button"`, `data-slot="field-label"`) for component sub-parts.

## Component Architecture

- Export components as named exports. Use `React.forwardRef` for components that wrap DOM elements to preserve ref forwarding.
- Use Radix UI primitives (`@radix-ui/react-*`) for accessibility-heavy components (dialogs, dropdowns, tabs, etc.).
- Use `Slot` from `@radix-ui/react-slot` for polymorphic components (e.g., `Button` with `asChild`).
- Keep components in `apps/frontend/src/components/ui` for primitives and `apps/frontend/src/components` for app-specific composed components.

## Typography

- Fonts have `antialiased` applied globally via Tailwind.
- Use `text-sm` as the default body size. `text-xs` for tertiary/meta text. `text-base` or `text-lg` for emphasis.
- Medium-sized headings generally look best with `font-medium` or `font-semibold`.
- Do not use `font-weight` below 400.
- Use `tracking-tight` for headings and `leading-none` / `leading-snug` / `leading-normal` intentionally.
- Prevent unexpected text resizing in landscape mode on iOS with `-webkit-text-size-adjust: 100%` (already set globally).
- Use `font-variant-numeric: tabular-nums` for numerical data in tables or timers.

## Motion & Animation

- **ALWAYS** respect `prefers-reduced-motion`. The global CSS already strips animations for users who prefer reduced motion.
- Animation duration should not exceed **200ms** for micro-interactions (hover, press, focus) to feel immediate.
- Dialogs and sheets should use `duration-200` for open/close transitions.
- Use `data-[state=open]:animate-in` and `data-[state=closed]:animate-out` patterns from Tailwind Animate for Radix state transitions.
- Do not animate dialog scale from `0` to `1`; use opacity + scale from `~0.95`.
- Button press scale should be subtle (`transform: scale(0.97)`) — the project already defines this globally for `button:active`, `a:active`, and `[role="button"]:active`.
- Avoid extraneous animations for frequent, low-novelty actions (right-click menus, list item add/remove, trivial hover states).
- Looping animations should pause when off-screen.
- Use `scroll-behavior: smooth` for in-page anchors (already enabled globally for `prefers-reduced-motion: no-preference`).
- Switching themes should not trigger transitions on elements. If adding theme-aware transitions, disable them temporarily during theme toggle.

## Touch & Mobile

- Hover states should not be visible on touch press. Use `@media (hover: hover)` for hover-only styles.
- Input font size should not be smaller than `16px` to prevent iOS zoom on focus. The `Input` component uses `text-base` with `md:text-sm` to satisfy this.
- Do not auto-focus inputs on touch devices; it opens the keyboard and covers the screen.
- The default iOS tap highlight is disabled globally (`-webkit-tap-highlight-color: transparent`), but always replace it with an appropriate alternative focus/active state.
- `touch-action: manipulation` is set globally on `html`.
- Disable `touch-action` for custom pan/zoom gesture components to prevent native scroll/zoom interference.
- Apply `muted` and `playsinline` to `<video />` tags for iOS auto-play.

## Interactivity

- Clicking a label should focus its associated input (use `Label` from `@/components/ui/label` with correct `htmlFor`).
- Inputs should be wrapped in a `<form>` when they trigger a submit action.
- Inputs should use appropriate `type` attributes (`password`, `email`, `tel`, `search`, etc.).
- Inputs should disable `spellcheck` and `autocomplete` when appropriate.
- Inputs should leverage HTML form validation (`required`, `min`, `max`, `pattern`) where possible.
- Input prefix/suffix decorations (icons, text) should be absolutely positioned or use `InputGroup` / `InputGroupAddon`, not placed as siblings that shift text.
- Toggles (`Switch`) should take effect immediately without requiring confirmation.
- Buttons should be disabled after submission to avoid duplicate network requests.
- Interactive elements should disable `user-select` for inner content (already applied globally to `button`, `a`, `[role="button"]`, `nav`).
- Decorative elements (glows, gradients) should disable `pointer-events` to not hijack events.
- Interactive elements in a vertical or horizontal list should have no dead areas between them; use padding instead of margins for spacing.

## Accessibility

- Disabled buttons should not have tooltips; they are not keyboard-accessible.
- Focusable elements in a sequential list should be navigable with `↑` / `↓` arrow keys.
- Dropdown menus should trigger on `mousedown` rather than `click` to open immediately on press.
- Icon-only interactive elements must define an explicit `aria-label`.
- Tooltips triggered by hover must not contain interactive content.
- Images should use `<img>` (not CSS backgrounds) for screen readers and right-click copyability.
- Illustrations built with HTML should have an explicit `aria-label` instead of announcing raw DOM trees.
- Gradient text should unset the gradient on `::selection` state.
- When using nested menus, use a "prediction cone" delay to prevent accidental closure when moving the pointer across items.

## Design Patterns

- Optimistically update data locally and roll back on server error with clear feedback.
- Authentication redirects should happen on the server before the client loads to avoid janky URL changes.
- Style the document selection state with `::selection` (already defined in the global theme).
- Display feedback relative to its trigger:
  - Show a temporary inline checkmark on a successful copy, not a toast.
  - Highlight the relevant input(s) on form error(s) using `aria-invalid` and ring/border colors.
- Empty states should prompt to create a new item, with optional templates. Use the `Empty` component family (`Empty`, `EmptyHeader`, `EmptyTitle`, `EmptyDescription`, `EmptyContent`, `EmptyMedia`).
- Use the `Field` component family (`Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `FieldGroup`, `FieldSet`) for consistent form layouts.
- Use the `Item` component family (`Item`, `ItemMedia`, `ItemContent`, `ItemTitle`, `ItemDescription`, `ItemActions`, `ItemGroup`) for list rows and settings rows.

## Examples

- "Add a modal dialog for confirming deletion" → Use `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, and `Button` with `variant="destructive"`.
- "Add a dropdown to select status" → Use `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`.
- "Add button with + icon to add new item" → Use `Button` with an icon child. If icon-only, add `aria-label` and wrap with `Tooltip`.
- "Add a destructive action button" → Use `Button` with `variant="destructive"`.
- "Make background color white/black" → Use `bg-background` and `text-foreground`; these adapt automatically to light/dark mode.
- "Animate the title in gracefully" → Use `duration-200` with `data-[state=open]:animate-in data-[state=open]:fade-in` and `data-[state=open]:zoom-in-95`.
- "Build a settings form" → Wrap inputs in `Form` + `FieldSet` + `FieldGroup` + `Field` with `FieldLabel`, `FieldDescription`, and `FieldError`.
- "Build a list of incidents" → Use `ItemGroup` + `Item` + `ItemMedia` + `ItemContent` + `ItemTitle` + `ItemDescription` + `ItemActions`.
