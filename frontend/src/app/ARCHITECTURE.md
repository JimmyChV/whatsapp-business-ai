# Frontend Architecture Baseline (Phase 2)

This folder scaffolds the target structure for incremental migration:
- app/
- pages/
- routes/
- features/
- shared/

Current migration strategy:
1) Keep compatibility reexports.
2) Move consumers gradually.
3) Remove legacy paths only after all imports are migrated.
