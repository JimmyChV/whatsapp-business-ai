# SaasEntityPage Pattern

`SaasEntityPage` is the shared shell for SaaS admin sections that manage a list,
detail view, and form. New sections should declare data and renderers, not their
own layout.

Core contract:

- Use a stable `sectionKey` for persisted user preferences.
- Provide `columns`, `rows`, `selectedId`, `onSelect`, `renderDetail`, and
  `renderForm` when possible.
- Use the built-in `SaasViewHeader`, `SaasDataTable`, and `SaasDetailPanel`
  through this component instead of section-specific wrappers.
- Keep destructive or closing actions styled with `saas-btn-cancel` or
  `is-danger`.
- Let `SaasEntityPage` own Escape-to-close behavior and the 40/60 split.

Migration note:

Legacy sections can keep their existing internals temporarily by adding
`saas-entity-page saas-entity-page--legacy` to the root section. This makes them
inherit the shared spacing, scrollbars, split sizing, and close-button treatment
while their internals are progressively moved to the declarative API.
