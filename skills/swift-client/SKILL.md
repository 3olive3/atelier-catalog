---
name: swift-client
description: Build, review, and improve Swift client apps (iOS/macOS) — SwiftUI, UIKit integration, state management, performance, animations, accessibility, Liquid Glass, and App Store patterns.
---

# Swift Client

Unified skill for native Apple client development. Covers SwiftUI best practices, UIKit bridging, iOS/macOS platform integration, and App Store compliance.

## Workflow Decision Tree

### 1) Review existing code
- **First, consult `references/latest-apis.md`** to check for deprecated APIs
- Check state management against property wrapper selection (see Quick Reference below)
- Verify view composition and extraction patterns
- Audit list performance and identity stability
- Check async work patterns with `.task`
- Validate navigation implementation
- Review accessibility: grouping, traits, Dynamic Type
- Inspect Liquid Glass usage if iOS 26+

### 2) Refactor existing code
- Replace deprecated APIs with modern equivalents
- Restructure state ownership
- Extract complex views into subviews
- Optimize performance hot paths
- Migrate UIKit wrappers to SwiftUI equivalents where possible

### 3) Implement new features
- Design data flow first: identify owned vs injected state
- Structure views for optimal composition
- Use modern APIs only (check deployment target)
- Handle async work with `.task` modifier
- Apply performance patterns early
- Gate iOS 26+ features with `#available` and provide fallbacks
- Use `Button` for tappable elements, add accessibility from the start

### 4) Answer best practice questions
- Load relevant reference file(s) based on topic

**If intent unclear, ask:** "Do you want findings only (review), or should I change the code (refactor)?"

## Quick Reference: Property Wrapper Selection

| Wrapper | Use When | Ownership |
|---------|----------|-----------|
| `@State` | Internal view state (value type or `@Observable` class) | View owns |
| `@Binding` | Child needs to modify parent's state | Parent owns |
| `@Bindable` | Injected `@Observable` object needing bindings (iOS 17+) | Injected |
| `@StateObject` | View creates an `ObservableObject` (pre-iOS 17) | View owns |
| `@ObservedObject` | View receives an `ObservableObject` (pre-iOS 17) | Injected |
| `let` | Read-only value from parent | Injected |
| `var` + `.onChange()` | Read-only value needing reactive updates | Injected |

**Key rules:**
- Always mark `@State` as `private`
- Never use `@State` for passed values (accepts initial value only)
- iOS 17+: Use `@State` with `@Observable` classes (not `@StateObject`)
- Nested `ObservableObject` doesn't propagate — pass nested objects directly; `@Observable` handles nesting fine

## Quick Reference: Modern API Replacements

| Deprecated | Modern Alternative | Notes |
|------------|-------------------|-------|
| `foregroundColor()` | `foregroundStyle()` | Supports dynamic type |
| `cornerRadius()` | `.clipShape(.rect(cornerRadius:))` | More flexible |
| `NavigationView` | `NavigationStack` | Type-safe navigation |
| `tabItem()` | `Tab` API | iOS 18+ |
| `onTapGesture()` | `Button` | Unless need location/count |
| `onChange(of:) { value in }` | `onChange(of:) { old, new in }` or `onChange(of:) { }` | Two or zero parameters |
| `UIScreen.main.bounds` | `GeometryReader` or layout APIs | Avoid hard-coded sizes |

## Core Guidelines

### View Composition
- Extract complex views into separate subviews
- Prefer modifiers over conditionals for state changes (maintains view identity)
- Keep view `body` simple and pure (no side effects)
- Use `@ViewBuilder` functions only for small sections
- Action handlers should reference methods, not contain inline logic
- Views should work in any context (don't assume screen size)

### Performance
- Pass only needed values to views (avoid large config objects)
- Eliminate unnecessary dependencies to reduce update fan-out
- Check for value changes before assigning state in hot paths
- Use `LazyVStack`/`LazyHStack` for large lists
- Use stable identity for `ForEach` (never `.indices` for dynamic content)
- Constant number of views per `ForEach` element; no inline filtering
- No `AnyView` in list rows; no object creation in `body`

### Animations
- Use `.animation(_:value:)` with value parameter (deprecated without)
- Use `withAnimation` for event-driven animations
- Prefer transforms (`offset`, `scale`) over layout changes (`frame`) for performance
- Transitions require animations outside the conditional structure
- Use `.phaseAnimator` / `.keyframeAnimator` for multi-step (iOS 17+)

### Accessibility
- `Button` over `onTapGesture` for tappable elements (free VoiceOver)
- `@ScaledMetric` for custom values that scale with Dynamic Type
- Group related elements with `accessibilityElement(children: .combine)`

### Liquid Glass (iOS 26+)
**Only adopt when explicitly requested.**
- Use native `glassEffect`, `GlassEffectContainer`, glass button styles
- Apply `.glassEffect()` after layout and visual modifiers
- Use `.interactive()` only for tappable/focusable elements

### UIKit Integration
- `UIViewRepresentable` / `UIViewControllerRepresentable` for UIKit in SwiftUI
- Diffable data sources for complex collection/table views
- Custom transitions via `UIViewControllerAnimatedTransitioning`

### App Store & Distribution
- App Store review guidelines compliance
- Privacy nutrition labels and app privacy reports
- TestFlight for beta testing
- Proper code signing and entitlements

## Review Checklist

### State Management
- [ ] `@State` properties marked `private`
- [ ] Passed values NOT declared as `@State` or `@StateObject`
- [ ] `@Binding` only where child modifies parent state
- [ ] Property wrapper selection follows ownership rules

### Modern APIs
- [ ] No deprecated modifiers
- [ ] Using `NavigationStack` instead of `NavigationView`
- [ ] Using `Button` instead of `onTapGesture` when appropriate
- [ ] Using two-parameter or no-parameter `onChange()`

### View Composition
- [ ] Using modifiers over conditionals for state changes
- [ ] Complex views extracted to separate subviews
- [ ] View `body` simple and pure

### Lists & Collections
- [ ] `ForEach` uses stable identity
- [ ] Constant views per element; no inline filtering
- [ ] No `AnyView` in list rows

### Performance
- [ ] Passing only needed values
- [ ] State updates check for value changes in hot paths
- [ ] `LazyVStack`/`LazyHStack` for large lists
- [ ] No object creation in `body`

### Async Work
- [ ] Using `.task` for automatic cancellation
- [ ] Using `.task(id:)` for value-dependent tasks
- [ ] Not mixing `.onAppear` with async work

### Accessibility
- [ ] `Button` for tappable elements
- [ ] `@ScaledMetric` for scalable values
- [ ] Related elements properly grouped

### Animations
- [ ] `.animation(_:value:)` with value parameter
- [ ] Transitions paired with animations outside conditional
- [ ] Transforms preferred over layout changes

## Constraints

- **Swift/SwiftUI/UIKit focus** — excludes server-side Swift (see `swift-server` skill)
- **No architecture mandates** — don't require MVVM/MVC/VIPER
- **No formatting/linting rules** — focus on correctness and patterns
- **Citations:** `developer.apple.com/documentation/swiftui/`, `developer.apple.com/documentation/swift/`

## Reference Files

Inherited from component skills:
- `references/latest-apis.md` — Version-segmented deprecated-to-modern API transitions
- `references/state-management.md` — Property wrappers and data flow
- `references/view-structure.md` — View composition and extraction
- `references/performance-patterns.md` — Optimization techniques
- `references/list-patterns.md` — ForEach identity and list best practices
- `references/layout-best-practices.md` — Layout patterns and testability
- `references/accessibility-patterns.md` — Accessibility traits, grouping, Dynamic Type
- `references/animation-basics.md` — Core animation concepts
- `references/animation-transitions.md` — Transitions and Animatable protocol
- `references/animation-advanced.md` — Phase/keyframe animations (iOS 17+)
- `references/sheet-navigation-patterns.md` — Sheet and navigation patterns
- `references/scroll-patterns.md` — ScrollView and programmatic scrolling
- `references/image-optimization.md` — AsyncImage and downsampling
- `references/liquid-glass.md` — iOS 26+ Liquid Glass API
