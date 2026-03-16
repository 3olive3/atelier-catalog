---
name: react-pro
description: "Modern React and Next.js development — hooks, composition, state management, performance optimization, TypeScript, and Vercel best practices."
---

# React Pro

Unified skill for production-ready React and Next.js applications. Covers component design, hooks, state management, React 19 features, performance optimization (45 Vercel rules), and TypeScript patterns.

## When to Apply

- Writing new React components or Next.js pages
- Implementing data fetching (client or server-side)
- Reviewing code for performance issues
- Refactoring existing React/Next.js code
- Optimizing bundle size or load times

## 1. Component Design

| Type | Use | State |
|------|-----|-------|
| **Server** | Data fetching, static | None |
| **Client** | Interactivity | useState, effects |
| **Presentational** | UI display | Props only |
| **Container** | Logic/state | Heavy state |

**Rules:** One responsibility per component. Props down, events up. Composition over inheritance.

## 2. Hook Patterns

- Hooks at top level only, same order every render
- Custom hooks start with "use"
- Clean up effects on unmount
- Extract hooks when logic is reused: `useLocalStorage`, `useDebounce`, `useFetch`, `useForm`

## 3. State Management

| Complexity | Solution |
|------------|----------|
| Simple | useState, useReducer |
| Shared local | Context |
| Server state | React Query, SWR |
| Complex global | Zustand, Redux Toolkit |

**Placement:** Single component → useState. Parent-child → lift up. Subtree → Context. App-wide → global store.

## 4. React 19 Features

| Hook | Purpose |
|------|---------|
| `useActionState` | Form submission state |
| `useOptimistic` | Optimistic UI updates |
| `use` | Read resources in render |

React Compiler: automatic memoization, less manual `useMemo`/`useCallback`.

## 5. Composition Patterns

- **Compound components**: Parent provides context, children consume, flexible slot-based
- **Custom hooks** for reusable logic; render props for render flexibility
- **Higher-order components** for cross-cutting concerns (sparingly)

## 6. Performance Rules (by Priority)

### CRITICAL: Eliminating Waterfalls
- Move `await` into branches where actually used
- `Promise.all()` for independent operations
- Use `Suspense` to stream content

### CRITICAL: Bundle Size
- Import directly, avoid barrel files
- `next/dynamic` for heavy components
- Load analytics/logging after hydration
- Preload on hover/focus for perceived speed

### HIGH: Server-Side
- `React.cache()` for per-request deduplication
- LRU cache for cross-request caching
- Minimize data passed to client components
- Restructure to parallelize fetches
- `after()` for non-blocking operations

### MEDIUM: Re-render Optimization
- Don't subscribe to state only used in callbacks
- Extract expensive work into memoized components
- Use primitive dependencies in effects
- Subscribe to derived booleans, not raw values
- Functional `setState` for stable callbacks
- `startTransition` for non-urgent updates

### MEDIUM: Rendering
- Animate wrapper div, not SVG element
- `content-visibility` for long lists
- Extract static JSX outside components
- Use ternary, not `&&` for conditionals
- Use `Activity` component for show/hide

## 7. Error Handling

- Error boundaries at root, feature, and risky component levels
- Show fallback UI, log error, offer retry, preserve user data

## 8. TypeScript Patterns

| Pattern | Use |
|---------|-----|
| Interface | Component props |
| Type | Unions, complex types |
| Generic | Reusable components |

Common types: `ReactNode` for children, `MouseEventHandler` for events, `RefObject<Element>` for refs.

## 9. Testing

| Level | Focus |
|-------|-------|
| Unit | Pure functions, hooks |
| Integration | Component behavior |
| E2E | User flows |

Prioritize: user-visible behavior, edge cases, error states, accessibility.

## 10. Anti-Patterns

| Don't | Do |
|-------|-----|
| Prop drilling deep | Use context |
| Giant components | Split smaller |
| useEffect for everything | Server components |
| Premature optimization | Profile first |
| Index as key | Stable unique ID |

## Reference Files

From react-best-practices:
- `rules/async-*.md` — Waterfall elimination rules
- `rules/bundle-*.md` — Bundle size optimization rules
- `rules/server-*.md` — Server-side performance rules
- `rules/client-*.md` — Client-side data fetching rules
- `rules/rerender-*.md` — Re-render optimization rules
- `rules/rendering-*.md` — Rendering performance rules
- `rules/js-*.md` — JavaScript performance rules
- `rules/advanced-*.md` — Advanced patterns
- `rules/_sections.md` — Full rule index
