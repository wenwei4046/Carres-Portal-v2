The one way to show a status in Carres — soft-tinted pill with dark same-hue text. Never render a status as bare coloured text.

```jsx
<StatusPill tone="ready" dot>Ready 1/1</StatusPill>
<StatusPill tone="waiting" dot>Waiting 0/3</StatusPill>
<StatusPill tone="overdue">Chase logistic</StatusPill>
```

Tones: `ready` (green) · `waiting` (amber) · `overdue` (red) · `neutral` (grey). `dot` adds a leading same-colour dot (used in the Stock column).
