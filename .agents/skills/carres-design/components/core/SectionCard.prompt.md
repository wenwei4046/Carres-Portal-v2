White collapsible panel on the grey canvas — the building block of the order-detail column. Collapses to a one-line summary.

```jsx
<SectionCard title="Balance" summary="No balance">
  <KeyValue label="Total" value="RM 1,749" />
  <KeyValue label="Collected" value="RM 200" />
</SectionCard>
```

`defaultOpen={false}` starts collapsed. Put a short state in `summary` so a collapsed card still tells the operator what's inside.
