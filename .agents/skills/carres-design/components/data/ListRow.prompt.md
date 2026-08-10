One order row in the Orders list — FIXED 44px tall. This is the rule that fixes "rows keep growing and the page scrolls forever".

```jsx
<table style={{ width: "100%", borderCollapse: "collapse" }}>
  <tbody>
    <ListRow order={{ ref: "TCF0475", extraRefs: 2, so: "SO-1112", customer: "Wong Young Huu",
      region: "Kuala…", deadline: "13 Jul 26", weekday: "Mon", late: true,
      stock: { tone: "waiting", label: "Waiting 0/3" },
      next: { tone: "overdue", label: "Chase logistic" } }} />
  </tbody>
</table>
```

Multi-REF collapses to first ref + "+N" (all refs live in the detail view). Selected rows take the blue wash.
