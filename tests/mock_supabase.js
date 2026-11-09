// Supabase falso en memoria, con permisos por local como la base real
(function(){
  const rows = [{"col": "munro/productos", "id": "p-001", "data": {"cat": "Fiambres", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 001", "obs": "", "orden": 1, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-001", "data": {"cat": "Fiambres", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 001", "obs": "", "orden": 1, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-002", "data": {"cat": "Fiambres", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 002", "obs": "", "orden": 2, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-002", "data": {"cat": "Fiambres", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 002", "obs": "", "orden": 2, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-003", "data": {"cat": "Fiambres", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 003", "obs": "", "orden": 3, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-003", "data": {"cat": "Fiambres", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 003", "obs": "", "orden": 3, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-004", "data": {"cat": "Fiambres", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 004", "obs": "", "orden": 4, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-004", "data": {"cat": "Fiambres", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 004", "obs": "", "orden": 4, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-005", "data": {"cat": "Fiambres", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 005", "obs": "", "orden": 5, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-005", "data": {"cat": "Fiambres", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 005", "obs": "", "orden": 5, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-006", "data": {"cat": "Fiambres", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 006", "obs": "", "orden": 6, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-006", "data": {"cat": "Fiambres", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 006", "obs": "", "orden": 6, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-007", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 007", "obs": "", "orden": 7, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-007", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 007", "obs": "", "orden": 7, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-008", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 008", "obs": "", "orden": 8, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-008", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 008", "obs": "", "orden": 8, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-009", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 009", "obs": "", "orden": 9, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-009", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 009", "obs": "", "orden": 9, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-010", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 010", "obs": "", "orden": 10, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-010", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 010", "obs": "", "orden": 10, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-011", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 011", "obs": "", "orden": 11, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-011", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 011", "obs": "", "orden": 11, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-012", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 012", "obs": "", "orden": 12, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-012", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 012", "obs": "", "orden": 12, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-013", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 013", "obs": "", "orden": 13, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-013", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 013", "obs": "", "orden": 13, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-014", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 014", "obs": "", "orden": 14, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-014", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 014", "obs": "", "orden": 14, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-015", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 015", "obs": "", "orden": 15, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-015", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 015", "obs": "", "orden": 15, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-016", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 016", "obs": "", "orden": 16, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-016", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 016", "obs": "", "orden": 16, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-017", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 017", "obs": "", "orden": 17, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-017", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 017", "obs": "", "orden": 17, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-018", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 018", "obs": "", "orden": 18, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-018", "data": {"cat": "Salsas", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 018", "obs": "", "orden": 18, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-019", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 019", "obs": "", "orden": 19, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-019", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 019", "obs": "", "orden": 19, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-020", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 020", "obs": "", "orden": 20, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-020", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 020", "obs": "", "orden": 20, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-021", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 021", "obs": "", "orden": 21, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-021", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 021", "obs": "", "orden": 21, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-022", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 022", "obs": "", "orden": 22, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-022", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 022", "obs": "", "orden": 22, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-023", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 023", "obs": "", "orden": 23, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-023", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 023", "obs": "", "orden": 23, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-024", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 024", "obs": "", "orden": 24, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-024", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 024", "obs": "", "orden": 24, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-025", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 025", "obs": "", "orden": 25, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-025", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 025", "obs": "", "orden": 25, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-026", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 026", "obs": "", "orden": 26, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-026", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 026", "obs": "", "orden": 26, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-027", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 027", "obs": "", "orden": 27, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-027", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 027", "obs": "", "orden": 27, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-028", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 028", "obs": "", "orden": 28, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-028", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 028", "obs": "", "orden": 28, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-029", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 029", "obs": "", "orden": 29, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-029", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 029", "obs": "", "orden": 29, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-030", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 030", "obs": "", "orden": 30, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-030", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 030", "obs": "", "orden": 30, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-031", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 031", "obs": "", "orden": 31, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-031", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 031", "obs": "", "orden": 31, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-032", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 032", "obs": "", "orden": 32, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-032", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 032", "obs": "", "orden": 32, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/productos", "id": "p-033", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 033", "obs": "", "orden": 33, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "torcuato/productos", "id": "p-033", "data": {"cat": "Complementos", "creado": 1792537000000, "min": null, "nombre": "Producto de prueba 033", "obs": "", "orden": 33, "sinStock": false, "stock": null, "unidad": "unidad"}}, {"col": "munro/fabrica", "id": "f-001", "data": {"bloque": 1, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 001", "orden": 1, "resaltar": true, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-001", "data": {"bloque": 1, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 001", "orden": 1, "resaltar": true, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-002", "data": {"bloque": 1, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 002", "orden": 2, "resaltar": true, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-002", "data": {"bloque": 1, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 002", "orden": 2, "resaltar": true, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-003", "data": {"bloque": 1, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 003", "orden": 3, "resaltar": true, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-003", "data": {"bloque": 1, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 003", "orden": 3, "resaltar": true, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-004", "data": {"bloque": 1, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 004", "orden": 4, "resaltar": true, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-004", "data": {"bloque": 1, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 004", "orden": 4, "resaltar": true, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-005", "data": {"bloque": 2, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 005", "orden": 5, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-005", "data": {"bloque": 2, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 005", "orden": 5, "resaltar": false, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-006", "data": {"bloque": 2, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 006", "orden": 6, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-006", "data": {"bloque": 2, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 006", "orden": 6, "resaltar": false, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-007", "data": {"bloque": 2, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 007", "orden": 7, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-007", "data": {"bloque": 2, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 007", "orden": 7, "resaltar": false, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-008", "data": {"bloque": 2, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 008", "orden": 8, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-008", "data": {"bloque": 2, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 008", "orden": 8, "resaltar": false, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-009", "data": {"bloque": 2, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 009", "orden": 9, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-009", "data": {"bloque": 2, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 009", "orden": 9, "resaltar": false, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-010", "data": {"bloque": 3, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 010", "orden": 10, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-010", "data": {"bloque": 3, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 010", "orden": 10, "resaltar": false, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-011", "data": {"bloque": 3, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 011", "orden": 11, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-011", "data": {"bloque": 3, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 011", "orden": 11, "resaltar": false, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-012", "data": {"bloque": 3, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 012", "orden": 12, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-012", "data": {"bloque": 3, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 012", "orden": 12, "resaltar": false, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-013", "data": {"bloque": 3, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 013", "orden": 13, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-013", "data": {"bloque": 3, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 013", "orden": 13, "resaltar": false, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-014", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 014", "orden": 14, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-014", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 014", "orden": 14, "resaltar": false, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-015", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 015", "orden": 15, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-015", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 015", "orden": 15, "resaltar": false, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-016", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 016", "orden": 16, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-016", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 016", "orden": 16, "resaltar": false, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-017", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 017", "orden": 17, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-017", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 017", "orden": 17, "resaltar": false, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-018", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 018", "orden": 18, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-018", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 018", "orden": 18, "resaltar": false, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-019", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 019", "orden": 19, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-019", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 019", "orden": 19, "resaltar": false, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-020", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 020", "orden": 20, "resaltar": true, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-020", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 020", "orden": 20, "resaltar": true, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-021", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 021", "orden": 21, "resaltar": true, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-021", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 021", "orden": 21, "resaltar": true, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-022", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 022", "orden": 22, "resaltar": true, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-022", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 022", "orden": 22, "resaltar": true, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-023", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 023", "orden": 23, "resaltar": true, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-023", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 023", "orden": 23, "resaltar": true, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-024", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 024", "orden": 24, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-024", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 024", "orden": 24, "resaltar": false, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-025", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 025", "orden": 25, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-025", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 025", "orden": 25, "resaltar": false, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-026", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 026", "orden": 26, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-026", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 026", "orden": 26, "resaltar": false, "sinStock": false}}, {"col": "munro/fabrica", "id": "f-027", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 027", "orden": 27, "resaltar": false, "sinStock": false}}, {"col": "torcuato/fabrica", "id": "f-027", "data": {"bloque": 4, "creado": 1792538000000, "fabrica": null, "local": null, "nombre": "Insumo de prueba 027", "orden": 27, "resaltar": false, "sinStock": false}}, {"col": "locales", "id": "munro", "data": {"nombre": "Munro", "orden": 1}}, {"col": "locales", "id": "torcuato", "data": {"nombre": "Torcuato", "orden": 2}}, {"col": "equipo", "id": "kmu15lopez@gmail.com", "data": {"email": "kmu15lopez@gmail.com", "rol": "creadora"}}, {"col": "equipo", "id": "dueno@example.com", "data": {"email": "dueno@example.com", "rol": "dueno"}}, {"col": "equipo", "id": "gerente.munro@example.com", "data": {"email": "gerente.munro@example.com", "rol": "gerente", "locales": ["munro"]}}, {"col": "equipo", "id": "lectura@example.com", "data": {"email": "lectura@example.com", "rol": "lectura", "locales": ["munro"]}}, {"col": "equipo", "id": "gerente.torcuato@example.com", "data": {"email": "gerente.torcuato@example.com", "rol": "gerente", "locales": ["torcuato"]}}];
  window.__rows = rows; window.__log = [];
  let session = null; const subs = [];
  const me = () => session && session.user.email;
  const acc = () => { const r = rows.find(x => x.col === 'equipo' && x.data.email === me()); return r ? r.data : null; };
  const total = a => a && ['creadora', 'dueno'].includes(a.rol);
  function canView(col, id, data){
    const a = acc(); if (!a) return col === 'solicitudes' && id === me();
    if (col === 'locales') return true;
    if (col === 'equipo') { const d = data || {}; return total(a) || d.email === me() || ['creadora', 'dueno'].includes(d.rol) || (d.locales || []).some(l => (a.locales || []).includes(l)); }
    if (col === 'solicitudes') return a.rol === 'creadora' || id === me();
    if (col === 'importaciones') return total(a);
    if (col === 'configuracion_negocio') return id === 'empresa-cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
    if (!col.includes('/')) return false;
    return total(a) || (a.locales || []).includes(col.split('/')[0]);
  }
  // Como el trigger proteger_sugerido de la base: solo administradora y dueño cambian "sugerido", "poco" y "exceso"
  function keepSug(col, prev, data){ if (!/\/(productos|hojas)$/.test(col) || total(acc())) return data; const d = {...data}; for (const k of ['sugerido', 'poco', 'exceso']){ if (prev && k in prev) d[k] = prev[k]; else delete d[k]; } return d; }
  // Como public.importar_mercaderia() de la base: rol, sucursal, destinos, cuartos, clave repetida, duplicados, conflictos, todo junto y registro.
  // window.__rpcFalla = 'antes' (se corta sin guardar) o 'despues' (guarda y se pierde la respuesta) simula falta de internet.
  function importar(a, x){
    const err = m => ({data:null, error:{message:'MGS:' + m}});
    const falla = window.__rpcFalla; if (falla === 'antes'){ window.__rpcFalla = null; return {data:null, error:{message:'TypeError: Failed to fetch'}}; }
    if (!a || !total(a)) return err('sin_permiso');
    if (!rows.some(r => r.col === 'locales' && r.id === x.p_local)) return err('sucursal');
    if (!['ingreso', 'conteo'].includes(x.p_operacion)) return err('operacion');
    if (!/^[A-Za-z0-9-]{8,64}$/.test(x.p_clave || '')) return err('clave');
    const its = x.p_items; if (!Array.isArray(its) || !its.length || its.length > 500) return err('items');
    if (new Set(its.map(i => i.col + '|' + i.id + '|' + i.campo)).size !== its.length) return err('repetidos');
    const prev = rows.find(r => r.col === 'importaciones' && r.id === x.p_clave);
    if (prev) return {data:{estado:'ok', repetida:true, aplicados:(prev.data.items || []).length, fecha:prev.data.fecha}, error:null};
    const ar = x.p_archivo || {}, h = ar.hash || '', c = ar.contenido || '';
    if (!x.p_forzar && (h || c)){
      const d = rows.filter(r => r.col === 'importaciones' && r.data.local === x.p_local && ((h && r.data.archivo.hash === h) || (c && r.data.archivo.contenido === c))).sort((p, q) => q.data.fecha - p.data.fecha)[0];
      if (d) return {data:{estado:'duplicado', fecha:d.data.fecha, por:d.data.por, archivo:d.data.archivo.nombre}, error:null};
    }
    const faltan = [], cambios = [];
    for (const i of its){
      if (!(i.col === 'fabrica' && i.campo === 'fabrica') || !i.id) return err('destino');
      const q = Number(i.cantidad); if (!Number.isFinite(q) || q < 0 || q > 100000 || Math.abs(q * 4 - Math.round(q * 4)) > 1e-9) return err('cantidad');
      const r = rows.find(z => z.col === x.p_local + '/' + i.col && z.id === i.id);
      if (!r){ faltan.push(i.nombre || i.id); continue; }
      if (!rows.some(z => z.col === x.p_local + '/hojas' && z.id === r.data.hoja && z.data.tipo === 'ingreso')) return err('destino');
      const act = r.data[i.campo] == null ? null : Number(r.data[i.campo]), ant = i.antes == null ? null : Number(i.antes);
      if (act !== ant) cambios.push({col:i.col, id:i.id, campo:i.campo, nombre:r.data.nombre, antes:ant, ahora:act});
    }
    if (faltan.length) return {data:{estado:'faltan', productos:faltan}, error:null};
    if (cambios.length) return {data:{estado:'conflicto', cambios}, error:null};
    const now = Date.now(), reg = [];
    for (const i of its){
      const r = rows.find(z => z.col === x.p_local + '/' + i.col && z.id === i.id), act = r.data[i.campo] == null ? null : Number(r.data[i.campo]);
      const nuevo = x.p_operacion === 'ingreso' ? Math.round(((act || 0) + Number(i.cantidad)) * 100) / 100 : Number(i.cantidad);
      r.data = {...r.data, [i.campo]:nuevo, actualizado:now, ...(i.col === 'productos' ? {sinStock:nuevo <= 0} : i.campo === 'local' ? {sinStock:nuevo === 0} : {})};
      reg.push({col:i.col, id:i.id, campo:i.campo, nombre:r.data.nombre || '', hoja:r.data.hoja || (i.col === 'productos' ? 'stock' : 'fabrica'), nombreHoja:i.nombreHoja || '', antes:act, cantidad:Number(i.cantidad), despues:nuevo, lineas:(i.lineas || []).slice(0, 20)});
      notify(x.p_local + '/' + i.col);
    }
    rows.push({col:'importaciones', id:x.p_clave, data:{local:x.p_local, operacion:x.p_operacion, fecha:now, por:me(), forzada:!!x.p_forzar, archivo:{nombre:ar.nombre || '', tipo:ar.tipo || '', hash:h, contenido:c}, items:reg, ignorados:(ar.ignorados || []).slice(0, 300)}});
    window.__log.push(['importar', x.p_local, x.p_operacion, reg.length]); notify('importaciones');
    if (falla === 'despues'){ window.__rpcFalla = null; return {data:null, error:{message:'TypeError: Failed to fetch'}}; }
    return {data:{estado:'ok', aplicados:reg.length, fecha:now}, error:null};
  }
  function canWrite(col){
    const a = acc(); if (!a) return false;
    // Igual que el backend: la creadora consulta en solo lectura salvo edición habilitada.
    if (['equipo', 'solicitudes', 'locales'].includes(col)) return a.rol === 'creadora';
    if (col === 'configuracion_negocio') return total(a);
    if (!col.includes('/')) return false;
    return total(a) || (['gerente', 'editor'].includes(a.rol) && (a.locales || []).includes(col.split('/')[0]));
  }
  function builder(){
    const st = {f:[]}; const b = {
      select(){ st.op = st.op || 'select'; return b; },
      eq(k,v){ st.f.push([k,v]); return b; },
      order(k,{ascending=true}={}){ st.sort={k,ascending}; return b; },
      range(from,to){ st.window=[from,to]; return b; },
      maybeSingle(){ st.single = true; return b; },
      upsert(r){ st.op = 'upsert'; st.row = r; return b; },
      delete(){ st.op = 'delete'; return b; },
      then(res, rej){ return Promise.resolve(run()).then(res, rej); }
    };
    const match = r => st.f.every(([k,v]) => r[k] === v);
    const colOf = () => (st.f.find(x => x[0] === 'col') || [])[1];
    function run(){
      if (st.op === 'select'){
        let d = rows.filter(match).filter(r => canView(r.col, r.id, r.data)).map(r => ({id:r.id, data:JSON.parse(JSON.stringify(r.data))}));
        if(st.sort){
          const {k,ascending}=st.sort;
          d.sort((a,b)=>String(a[k]??'').localeCompare(String(b[k]??''))*(ascending?1:-1));
        }
        if(st.window)d=d.slice(st.window[0],st.window[1]+1);
        return {data: st.single ? (d[0] || null) : d, error:null};
      }
      if (st.op === 'upsert'){ if (st.row.col === 'configuracion_negocio' && (st.row.id !== 'empresa-cb0dc04a-9a13-434f-a3d0-47f1d8f39670' || !['fisica','online','mixta'].includes(st.row.data.tipo))) return {error:{code:'42501',message:'Configuración inválida'}}; if (!canWrite(st.row.col)) return {error:{code:'42501', message:'new row violates row-level security policy'}}; const i = rows.findIndex(r => r.col === st.row.col && r.id === st.row.id); const nr = {col:st.row.col, id:st.row.id, data:keepSug(st.row.col, i >= 0 ? rows[i].data : null, st.row.data)}; if (i >= 0) rows[i] = nr; else rows.push(nr); window.__log.push(['set', st.row.col, st.row.id]); notify(st.row.col); return {error:null}; }
      if (st.op === 'delete'){ const c = colOf(); if (!canWrite(c)) return {error:null}; for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) rows.splice(i, 1); window.__log.push(['delete', c]); notify(c); return {error:null}; }
    }
    return b;
  }
  // --- NFC y QR ficticio (ver gestlok_nfc_* en supabase/migrations/*nfc*) ---
  function nfcRpc(fn, x, a){
    const err = (m, code) => ({data:null, error:{code:code||'22023', message:m}});
    if (a?.rol !== 'creadora' || me() !== 'kmu15lopez@gmail.com') return err('Acceso exclusivo de la creadora', '42501');
    const st = window.__nfc = window.__nfc || {comercios:[], placas:[], hist:[], fb:'https://belisaparfum.mitiendanube.com/', seq:0};
    const URL_OK = /^https?:\/\/[^\s<>"]+$/i, now = () => new Date().toISOString();
    const url = v => { const s = String(v ?? '').trim(); if (!s) return null; if (!URL_OK.test(s)) throw 'El destino tiene que ser un link completo que empiece con https://'; return s; };
    const com = id => st.comercios.find(c => c.id === id), suc = id => { for (const c of st.comercios) { const s = c.sucursales.find(y => y.id === id); if (s) return s; } return null; };
    const place = (c, s) => c ? (com(c)?.nombre || '') + (s ? ' · ' + (suc(s)?.nombre || '') : '') : 'Sin comercio';
    const ef = p => p.destino ? {url:p.destino, origen:'placa'} : (p.sucursal_id && suc(p.sucursal_id)?.destino) ? {url:suc(p.sucursal_id).destino, origen:'sucursal'} : (p.comercio_id && com(p.comercio_id)?.destino) ? {url:com(p.comercio_id).destino, origen:'comercio'} : {url:null, origen:null};
    const pj = p => ({...p, etiqueta:p.cliente, destino_efectivo:ef(p).url, origen:ef(p).origen, escaneos_30d:p.escaneos});
    const log = (accion, code, c, s, detalle) => st.hist.unshift({at:now(), accion, code, comercio_id:c||null, sucursal_id:s||null, detalle});
    const check = (c, s) => { if (s && !c) throw 'Elegí el comercio de la sucursal'; if (c && !com(c)) throw 'El comercio no existe'; if (s && !com(c).sucursales.some(y => y.id === s)) throw 'La sucursal no es de ese comercio'; };
    const cj = c => JSON.parse(JSON.stringify(c));
    try {
      if (fn === 'gestlok_nfc_list') return {data:{scope:'nfc_list', version:2, generated_at:now(), destino_sin_activar:st.fb, comercios:st.comercios.map(cj), placas:st.placas.map(pj)}, error:null};
      if (fn === 'gestlok_nfc_comercio_guardar'){
        const nombre = String(x.p_nombre || '').trim(), destino = url(x.p_destino);
        if (!nombre) throw 'El nombre de el comercio tiene que tener entre 1 y 80 caracteres';
        if (st.comercios.some(c => c.id !== x.p_id && c.nombre.toLowerCase() === nombre.toLowerCase())) return err('Ya existe un comercio llamado «' + nombre + '»', '23505');
        if (!x.p_id){ const c = {id:'com-' + (++st.seq), nombre, destino, nota:x.p_nota || '', sucursales:[]}; st.comercios.push(c); log('comercio_creado', null, c.id, null, 'Comercio creado: ' + nombre); return {data:cj(c), error:null}; }
        const c = com(x.p_id); if (!c) throw 'El comercio no existe';
        if (!destino && c.destino && st.placas.some(p => p.comercio_id === c.id && p.activa && !p.destino && !(p.sucursal_id && suc(p.sucursal_id)?.destino))) throw 'Hay placas activas que usan el link del comercio. Desactivalas o cargá otro link.';
        if (c.destino !== destino) log('comercio_editado', null, c.id, null, 'Link: ' + (c.destino || 'sin link') + ' → ' + (destino || 'sin link'));
        Object.assign(c, {nombre, destino, nota:x.p_nota || ''}); return {data:cj(c), error:null};
      }
      if (fn === 'gestlok_nfc_sucursal_guardar'){
        const nombre = String(x.p_nombre || '').trim(), destino = url(x.p_destino);
        if (!nombre) throw 'El nombre de la sucursal tiene que tener entre 1 y 80 caracteres';
        if (!x.p_id){ const c = com(x.p_comercio); if (!c) throw 'El comercio no existe'; if (c.sucursales.some(y => y.nombre.toLowerCase() === nombre.toLowerCase())) return err('Ese comercio ya tiene una sucursal llamada «' + nombre + '»', '23505');
          const s = {id:'suc-' + (++st.seq), nombre, destino}; c.sucursales.push(s); log('sucursal_creada', null, c.id, s.id, 'Sucursal creada: ' + nombre); return {data:{...s, comercio_id:c.id}, error:null}; }
        const s = suc(x.p_id); if (!s) throw 'La sucursal no existe';
        const c = st.comercios.find(k => k.sucursales.includes(s));
        if (!destino && s.destino && st.placas.some(p => p.sucursal_id === s.id && p.activa && !p.destino && !c.destino)) throw 'Hay placas activas que usan el link de esta sucursal. Desactivalas o cargá otro link.';
        if (s.destino !== destino) log('sucursal_editada', null, c.id, s.id, 'Link: ' + (s.destino || 'sin link') + ' → ' + (destino || 'sin link'));
        Object.assign(s, {nombre, destino}); return {data:{...s, comercio_id:c.id}, error:null};
      }
      if (fn === 'gestlok_nfc_crear_placas' || fn === 'gestlok_nfc_create'){
        const k = Number(x.p_cantidad), c = x.p_comercio || null, s = x.p_sucursal || null, act = !!x.p_activar;
        if (!(k >= 1 && k <= 200)) throw 'Podés crear entre 1 y 200 placas por vez';
        check(c, s);
        if (act && !((s && suc(s)?.destino) || (c && com(c)?.destino))) throw 'Para crearlas activas, cargá antes el link de la sucursal o del comercio';
        const desde = st.placas.reduce((m, p) => Math.max(m, p.numero), 0) + 1, codes = [];
        for (let i = 0; i < k; i++){
          let code; do { code = Array.from({length:6}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join(''); } while (st.placas.some(p => p.code === code));
          st.placas.push({code, numero:desde + i, cliente:'', destino:null, nota:'', activa:act, escaneos:0, ultimo_escaneo:null, comercio_id:c, sucursal_id:s});
          codes.push(code); log('placa_creada', code, c, s, 'Placa N° ' + String(desde + i).padStart(3, '0') + ' creada en ' + place(c, s));
        }
        return {data:{creadas:k, desde, hasta:desde + k - 1, codes}, error:null};
      }
      if (fn === 'gestlok_nfc_update'){
        const p = st.placas.find(y => y.code === String(x.p_code || '').toUpperCase()); if (!p) throw 'La placa no existe';
        const destino = url(x.p_destino), next = {...p, destino};
        if (x.p_activa && !ef(next).url) throw 'Para activar la placa cargá el link de destino';
        if (p.destino !== destino) log('placa_editada', p.code, p.comercio_id, p.sucursal_id, 'Link propio: ' + (p.destino || 'ninguno') + ' → ' + (destino || 'ninguno'));
        if (p.activa !== !!x.p_activa) log(x.p_activa ? 'placa_activada' : 'placa_desactivada', p.code, p.comercio_id, p.sucursal_id, x.p_activa ? 'Activada' : 'Desactivada');
        Object.assign(p, {cliente:String(x.p_cliente || '').trim(), destino, nota:String(x.p_nota || '').trim(), activa:!!x.p_activa});
        return {data:pj(p), error:null};
      }
      if (fn === 'gestlok_nfc_activar'){
        const codes = [...new Set((x.p_codes || []).map(c => String(c).toUpperCase()))]; if (!codes.length) throw 'Elegí al menos una placa';
        let n = 0; const sin = [];
        for (const p of st.placas.filter(y => codes.includes(y.code))){
          if (p.activa === !!x.p_activa) continue;
          if (x.p_activa && !ef(p).url){ sin.push(p.code); continue; }
          p.activa = !!x.p_activa; n++; log(p.activa ? 'placa_activada' : 'placa_desactivada', p.code, p.comercio_id, p.sucursal_id, p.activa ? 'Activada' : 'Desactivada');
        }
        return {data:{cambiadas:n, sin_link:sin, no_existen:[]}, error:null};
      }
      if (fn === 'gestlok_nfc_reasignar'){
        const c = x.p_comercio || null, s = x.p_sucursal || null; check(c, s);
        const codes = (x.p_codes || []).map(v => String(v).toUpperCase()); if (!codes.length) throw 'Elegí al menos una placa';
        let n = 0, off = 0;
        for (const p of st.placas.filter(y => codes.includes(y.code))){
          if (p.comercio_id === c && p.sucursal_id === s) continue;
          const de = place(p.comercio_id, p.sucursal_id);
          if (p.comercio_id !== c) p.cliente = '';
          Object.assign(p, {comercio_id:c, sucursal_id:s, destino:null});
          log('placa_reasignada', p.code, c, s, 'Reasignada de ' + de + ' a ' + place(c, s));
          if (p.activa && !ef(p).url){ p.activa = false; off++; log('placa_desactivada', p.code, c, s, 'Desactivada al reasignar'); }
          n++;
        }
        return {data:{movidas:n, desactivadas:off, no_existen:[]}, error:null};
      }
      if (fn === 'gestlok_nfc_historial'){
        const code = x.p_code ? String(x.p_code).toUpperCase() : null;
        return {data:st.hist.filter(h => (!code || h.code === code) && (!x.p_comercio || h.comercio_id === x.p_comercio)).slice(0, x.p_limit || 100)
          .map(h => ({...h, numero:h.code ? st.placas.find(p => p.code === h.code)?.numero : null})), error:null};
      }
      if (fn === 'gestlok_nfc_set_fallback'){ st.fb = url(x.p_destino); log('ajuste_editado', null, null, null, 'Link de placas sin comercio: ' + (st.fb || 'ninguno')); return {data:st.fb, error:null}; }
      return err('Función desconocida', '42883');
    } catch (e) { return err(typeof e === 'string' ? e : 'Error'); }
  }
  function cajaRpc(fn, x, a){
    const err = (m, code) => ({data:null, error:{code:code || '22023', message:m}});
    const TEN = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
    const ok = !!a && ['dueno','gerente','editor'].includes(a.rol) && (window.__cajaHabilitada || []).includes(me());
    (window.__cajaLlamadas = window.__cajaLlamadas || []).push([fn, me()]);
    const hoy = window.__cajaDia || new Intl.DateTimeFormat('en-CA', {timeZone:'America/Argentina/Buenos_Aires'}).format(new Date());
    if (fn === 'gestlok_caja_acceso') return {data: ok ? {habilitada:true, tenant_id:TEN, hoy} : {habilitada:false}, error:null};
    // GESTLOK Caja (app completa en /caja/): solo las cuentas de window.__cajaAppHabilitada (como Perfumes en el servidor).
    if (fn === 'gestlok_caja_app_acceso') {
      const app = !!a && ['dueno','gerente','editor'].includes(a.rol) && (window.__cajaAppHabilitada || []).includes(me());
      return {data: app ? {habilitada:true, tenant_id:TEN, url:'/caja/', locales:['Belisa Parfum'], yo:'Camila'} : {habilitada:false}, error:null};
    }
    if (!ok) return err('Sin permiso para la caja de esta empresa', '42501');
    const st = window.__caja = window.__caja || {turnos:[], auditoria:[]};
    const cerrar = (t, tipo, resp) => {
      const vivos = t.movimientos.filter(m => !m.anulado);
      const suma = k => Math.round(vivos.filter(m => m.metodo === k).reduce((v, m) => v + m.monto, 0) * 100) / 100;
      Object.assign(t, {estado:'cerrado', tipo_cierre:tipo, cerrado_at:new Date().toISOString(), cerrado_por:tipo === 'manual' ? me() : null,
        responsable:resp || t.responsable, efectivo:suma('efectivo'), transferencia:suma('transferencia'), ventas:vivos.length});
      t.total = Math.round((t.efectivo + t.transferencia) * 100) / 100;
      st.auditoria.push({accion:tipo === 'manual' ? 'cierre_manual' : 'cierre_automatico', turno:t.id});
    };
    window.__cajaCron = () => { const d = window.__cajaDia || hoy; let n = 0; for (const t of st.turnos) if (t.estado === 'abierto' && t.dia <= d) { cerrar(t, 'automatico'); n++; } return n; };
    for (const t of st.turnos) if (t.estado === 'abierto' && t.dia < hoy) cerrar(t, 'automatico');
    const pay = t => {
      if (!t) return null;
      if (t.estado === 'cerrado') return JSON.parse(JSON.stringify(t));
      const vivos = t.movimientos.filter(m => !m.anulado), suma = k => Math.round(vivos.filter(m => m.metodo === k).reduce((v, m) => v + m.monto, 0) * 100) / 100;
      return JSON.parse(JSON.stringify({...t, efectivo:suma('efectivo'), transferencia:suma('transferencia'), total:Math.round((suma('efectivo') + suma('transferencia')) * 100) / 100, ventas:vivos.length}));
    };
    const deHoy = st.turnos.find(t => t.dia === hoy);
    const turno = st.turnos.find(t => t.id === x.p_turno);
    const resp = String(x.p_responsable || '').trim();
    if (fn === 'gestlok_caja_estado')
      return {data:{tenant_id:TEN, hoy, ahora:new Date().toISOString(), limite:hoy + 'T23:59:00-03:00', puede_abrir:!deHoy, turno:pay(deHoy),
        historial:st.turnos.filter(t => t.estado === 'cerrado').sort((p, q) => q.dia.localeCompare(p.dia)).map(t => { const c = pay(t); delete c.movimientos; return c; })}, error:null};
    if (fn === 'gestlok_caja_abrir'){
      if (resp.length < 2 || resp.length > 80) return err('Escribí el nombre de la persona responsable de la caja');
      if (deHoy) return {data:{nuevo:false, turno:pay(deHoy)}, error:null};
      const t = {id:'caja-' + hoy, dia:hoy, estado:'abierto', responsable:resp, abierto_at:new Date().toISOString(), abierto_por:me(), cerrado_at:null, cerrado_por:null, tipo_cierre:null, movimientos:[]};
      st.turnos.push(t); st.auditoria.push({accion:'apertura', turno:t.id});
      return {data:{nuevo:true, turno:pay(t)}, error:null};
    }
    if (!turno) return err('La caja no corresponde a tu empresa', '42501');
    if (fn === 'gestlok_caja_detalle') return {data:pay(turno), error:null};
    if (fn === 'gestlok_caja_cerrar'){
      if (resp.length < 2 || resp.length > 80) return err('Escribí el nombre de la persona responsable del cierre');
      if (turno.estado === 'cerrado') return {data:{ya_cerrado:true, turno:pay(turno)}, error:null};
      cerrar(turno, 'manual', resp); return {data:{ya_cerrado:false, turno:pay(turno)}, error:null};
    }
    if (fn === 'gestlok_caja_registrar'){
      const monto = Number(x.p_monto);
      if (!['efectivo','transferencia'].includes(x.p_metodo) || !(monto > 0) || monto >= 1e10 || Math.round(monto * 100) !== monto * 100 || !x.p_operacion)
        return err('Revisá el medio de pago y el importe (mayor a 0, hasta 2 decimales)');
      const prev = turno.movimientos.find(m => m.operacion === x.p_operacion);
      if (prev) return {data:{repetida:true, movimiento_id:prev.id, turno:pay(turno)}, error:null};
      if (turno.estado !== 'abierto' || turno.dia !== hoy) return err('La caja de ese día ya está cerrada');
      if (window.__cajaFalla){ window.__cajaFalla = false; return err('TypeError: Failed to fetch', ''); }
      const m = {id:'venta-' + (turno.movimientos.length + 1), operacion:x.p_operacion, metodo:x.p_metodo, monto, nota:String(x.p_nota || '').trim(), registrado_at:new Date().toISOString(), registrado_por:me(), anulado:false};
      turno.movimientos.push(m); st.auditoria.push({accion:'venta', turno:turno.id});
      return {data:{repetida:false, movimiento_id:m.id, turno:pay(turno)}, error:null};
    }
    if (fn === 'gestlok_caja_anular'){
      const m = turno.movimientos.find(v => v.id === x.p_movimiento);
      if (!m) return err('La venta no existe en esta caja');
      if (m.anulado) return {data:{repetida:true, turno:pay(turno)}, error:null};
      if (turno.estado !== 'abierto') return err('La caja de ese día ya está cerrada');
      m.anulado = true; m.anulado_at = new Date().toISOString(); st.auditoria.push({accion:'anulacion', turno:turno.id});
      return {data:{repetida:false, turno:pay(turno)}, error:null};
    }
    if (fn === 'gestlok_caja_responsable'){
      if (resp.length < 2 || resp.length > 80) return err('Escribí el nombre de la persona responsable de la caja');
      if (turno.estado !== 'abierto') return err('La caja de ese día ya está cerrada');
      turno.responsable = resp; return {data:{turno:pay(turno)}, error:null};
    }
    return err('Operación desconocida');
  }
  function notify(col){ setTimeout(() => subs.filter(s => s.col === col).forEach(s => s.cb({})), 20); }
  window.supabase = { createClient(){ const listeners = []; return {
    auth: {
      onAuthStateChange(cb){ listeners.push(cb); setTimeout(() => cb('INITIAL_SESSION', session), 0); return {data:{subscription:{unsubscribe(){}}}}; },
      async getSession(){ return {data:{session}}; },
      async getUser(){
        if(!session?.user)return {data:{user:null},error:{message:'Sin sesión'}};
        const user=session.user;
        return {data:{user:{...user,id:user.email==='kmu15lopez@gmail.com'?'creadora-fixture-uid':'duena-fixture-uid'}},error:null};
      },
      async signInWithPassword({email, password}){ if (password !== 'secreto1') return {error:{message:'Invalid login credentials'}}; session = {user:{email,user_metadata:window.__signup?.email===email?window.__signup.options.data:{}}}; listeners.forEach(cb => cb('SIGNED_IN', session)); return {error:null}; },
      async signInWithOAuth(o){ window.__oauth = o; return {error:null}; },
      async signUp(args){ window.__signup=args; return {data:{session:null}, error:null}; },
      async resetPasswordForEmail(){ return {error:null}; },
      async updateUser(){ return {error:null}; },
      async signOut(){ session = null; }
    },
    from(table){
      // Solo para la prueba de navegación privada del Scanner de ZAYRO.
      // No modifica permisos simulados de otras empresas ni datos de producción.
      if(table==='gestlok_pilot_access'){
        const b={select(){return b;},eq(){return b;},maybeSingle(){
          if(window.__tenantOverride!=='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103' || !session?.user)
            return Promise.resolve({data:null,error:null});
          const role=acc()?.rol;
          if(!['creadora','dueno'].includes(role))return Promise.resolve({data:null,error:null});
          return Promise.resolve({data:{enabled:true,plan_code:'scanner',owner_uid:'duena-fixture-uid'},error:null});
        }};
        return b;
      }
      return builder();
    },
    async rpc(fn, args){
      const a = acc();
      // Caja diaria (como las RPC gestlok_caja_*): solo las cuentas de window.__cajaHabilitada (dueño, gerente o editor).
      // Una caja por día de Argentina (window.__cajaDia la fija), idempotencia por operación, cierre idempotente,
      // sin reapertura y window.__cajaCron() simula el cierre automático de las 23:59 del servidor.
      if (/^gestlok_caja_/.test(fn)) return cajaRpc(fn, args || {}, a);
      // NFC y QR (como las RPC gestlok_nfc_*): solo la creadora; comercios y sucursales con link propio,
      // placas que usan su link, el de la sucursal o el del comercio; activar, reasignar e historial en memoria.
      if (/^gestlok_nfc_/.test(fn)) return nfcRpc(fn, args || {}, a);
      // Estado ficticio para probar Pagos Online sin consultar datos de Mi Gusto.
      if (fn === 'gestlok_mg_online_state'){
        const loc=args?.p_local;
        if(!a||!['munro','torcuato'].includes(loc)||!(total(a)||(a.rol==='gerente'&&(a.locales||[]).includes(loc))))
          return {data:null,error:{code:'42501',message:'Sin permiso para el local'}};
        const moves=(window.__mgOnlineSaved||[]).filter(m=>m.local===loc);
        return {data:{active:{id:'turno-ficticio-'+loc,day:new Date().toISOString().slice(0,10),turno:'manana',status:'abierto',movements:moves,transferencia:0,getnet:0,mercado_pago:0,total_app:0,total_ventas:0,online_local:0,comandas:0},history:[]},error:null};
      }
      // Guardado ficticio de una comanda de Pagos Online: solo en memoria del navegador de prueba.
      if (fn === 'gestlok_mg_online_save_note'){
        const loc=args?.p_local;
        if(!a||!['munro','torcuato'].includes(loc)||!(total(a)||(a.rol==='gerente'&&(a.locales||[]).includes(loc))))
          return {data:null,error:{code:'42501',message:'Sin permiso para el local'}};
        if(window.__mgOnlineSaveFail)return {data:null,error:{message:'No se pudo guardar el cambio'}};
        const list=window.__mgOnlineSaved=window.__mgOnlineSaved||[];
        const id=args.p_id||('mov-'+(list.length+1));
        const row={id,local:loc,comanda:String(args.p_comanda),amount:Number(args.p_amount),method:args.p_method,app:!!args.p_app,observacion:args.p_observacion||'',created_at:new Date().toISOString()};
        const i=list.findIndex(m=>m.id===id);if(i>=0)list[i]=row;else list.push(row);
        return {data:{id},error:null};
      }
      if (fn === 'gestlok_my_registration'){
        const row=rows.find(r=>r.col==='registration_requests'&&r.id===me());
        return {data:row?.data.tipoCuenta?{kind:row.data.tipoCuenta,modules:row.data.modulosSolicitados,status:row.data.status||'pending'}:null,error:null};
      }
      if (fn === 'gestlok_request_registration'){
        if(window.__registrationFail)return {data:null,error:{message:'Sin conexión'}};
        const kind=args?.p_kind,modules=args?.p_modules;
        if(!session||a)return {data:null,error:{code:'42501',message:'Sin permiso'}};
        if(!['dueno','colaborador'].includes(kind)||!Array.isArray(modules)||new Set(modules).size!==modules.length||modules.length>2||modules.some(m=>!['comercial','recibos_personal'].includes(m))||(kind==='dueno'?!modules.length:!!modules.length))return {data:null,error:{code:'22023',message:'Selección inválida'}};
        let row=rows.find(r=>r.col==='registration_requests'&&r.id===me());
        if(!row){row={col:'registration_requests',id:me(),data:{email:me(),fecha:Date.now()}};rows.push(row);}
        row.data={...row.data,tipoCuenta:kind,modulosSolicitados:[...modules].sort(),status:'pending'};notify('solicitudes');
        return {data:{kind,modules:[...modules].sort(),status:'pending'},error:null};
      }
      if (fn === 'gestlok_creator_registration_requests'){
        if(a?.rol!=='creadora')return {data:null,error:{code:'42501',message:'Sin permiso'}};
        return {data:rows.filter(r=>r.col==='registration_requests'&&(r.data.status||'pending')==='pending').map(r=>({id:'registration-'+r.id,registrationUserId:r.id,...r.data})),error:null};
      }
      if (fn === 'gestlok_review_registration'){
        if(a?.rol!=='creadora')return {data:null,error:{code:'42501',message:'Sin permiso'}};
        const row=rows.find(r=>r.col==='registration_requests'&&r.id===args.p_user);
        if(!row||!['assigned','rejected'].includes(args.p_status))return {error:{code:'22023',message:'Solicitud inválida'}};
        if(args.p_status==='assigned'&&!rows.some(r=>r.col==='equipo'&&r.data.email===row.data.email))return {error:{code:'42501',message:'Primero se debe asignar'}};
        row.data.status=args.p_status;return {data:null,error:null};
      }
      if (fn === 'gestlok_creator_companies_index'){
        if(a?.rol!=='creadora')return {data:null,error:{code:'42501',message:'Sin permiso'}};
        return {data:{scope:'metadata_only',companies:[{tenant_id:window.__tenantOverride||'cb0dc04a-9a13-434f-a3d0-47f1d8f39670',name:window.__companyOverride||'Empresa ficticia',owners:1,locals:[{id:'munro',name:'Munro'},{id:'torcuato',name:'Torcuato'}],modules:{comercial:true,recibos_personal:!!window.__staffModule},recibonet:{organization_number:'2099001',verified_at:'2026-10-25T21:00:00Z'}},{tenant_id:'00000000-0000-4000-8000-000000000222',name:'Otra empresa ficticia',owners:1,locals:[{id:'otro',name:'Otro local'}],modules:{comercial:true,recibos_personal:false},recibonet:null}]},error:null};
      }
      if (fn === 'gestlok_creator_dashboard'){
        if(!window.__dashboard||a?.rol!=='creadora')return {data:null,error:{code:'42501',message:'Sin permiso'}};
        const day=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
        return {data:{scope:'creator_dashboard',generated_at:new Date().toISOString(),
          totals:{companies:2,companies_new_week:1,users:9,users_with_login:6,users_never:3,users_new_week:9,locals:3,employees:7,employees_new_week:3,employees_pending:0,modules_enabled:1,audit:3},
          roles:{creadora:1,dueno:3,gerente:4,editor:1,lectura:0},employees_roles:{owner:4,manager:2,employee:0,gestlok_gerentes:5},
          series:[30,20,10,0].map((n,i)=>({d:day(n),empresas:i>2?2:0,usuarios:i*3,empleados:i*2})),
          period:{companies:2,users:9,employees:7,modules:1},
          recent_companies:[{tenant_id:'00000000-0000-4000-8000-000000000222',name:'Otra empresa ficticia',created_at:new Date(Date.now()-3600000).toISOString(),locals:1,people:1,employees_module:false},{tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670',name:'Empresa ficticia',created_at:new Date(Date.now()-86400000).toISOString(),locals:2,people:8,employees_module:true}],
          activity:[{at:new Date(Date.now()-600000).toISOString(),kind:'audit',what:'module_enabled',who:null,company:'Empresa ficticia'}],
          system:{accounts:6,confirmed_accounts:6,verified_links:2,editing_open:false,support_open:false}},error:null};
      }
      if (fn === 'gestlok_gerente_area_context'){
        if(window.__gerenteFail||a?.rol!=='gerente')return {data:null,error:{code:'42501',message:'Acceso exclusivo de gerentes autorizados'}};
        const ctx={data:{role:'gerente',horarios:true,tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670',local_ids:(a.locales||[]).map(id=>id==='torcuato'?'dt':id)},error:null};
        // Solo con window.__gerenteSlow llega con demora (prueba de «aparece sola»); en las demás pruebas responde al instante para no redibujar mientras se escribe.
        return window.__gerenteSlow?new Promise(r=>setTimeout(()=>r(ctx),1200)):ctx;
      }
      if (fn === 'gestlok_creator_set_module'){
        if(a?.rol!=='creadora')return {data:null,error:{code:'42501',message:'Sin permiso'}};
        if(args.p_tenant!=='cb0dc04a-9a13-434f-a3d0-47f1d8f39670')return {data:null,error:{code:'22023',message:'La empresa no tiene una organización de ReciboNet vinculada y verificada'}};
        const changed=!!window.__staffModule!==!!args.p_enabled;window.__staffModule=!!args.p_enabled;
        if(changed)(window.__audit=window.__audit||[]).unshift({at:new Date().toISOString(),action:args.p_enabled?'module_enabled':'module_disabled',tenant_id:args.p_tenant,detail:{module:args.p_module}});
        return {data:{tenant_id:args.p_tenant,module:args.p_module,enabled:!!args.p_enabled,changed},error:null};
      }
      if (fn === 'gestlok_creator_editing_state'){
        if(a?.rol!=='creadora')return {data:null,error:{code:'42501',message:'Sin permiso'}};
        return {data:{active:true,permanent:true,expires_at:null},error:null};
      }
      if (fn === 'gestlok_creator_enable_editing'){
        if(a?.rol!=='creadora')return {data:null,error:{code:'42501',message:'Sin permiso'}};
        if(!(args.p_minutes>=5&&args.p_minutes<=120)||String(args.p_reason||'').trim().length<3)return {data:null,error:{code:'22023',message:'Indicá el motivo de la edición'}};
        window.__creatorEditing=true;(window.__audit=window.__audit||[]).unshift({at:new Date().toISOString(),action:'editing_enabled',tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670',detail:{minutes:args.p_minutes}});
        return {data:{active:true,expires_at:new Date(Date.now()+args.p_minutes*60000).toISOString()},error:null};
      }
      if (fn === 'gestlok_creator_disable_editing'){
        if(a?.rol!=='creadora')return {data:null,error:{code:'42501',message:'Sin permiso'}};
        if(window.__creatorEditing)(window.__audit=window.__audit||[]).unshift({at:new Date().toISOString(),action:'editing_disabled',tenant_id:'cb0dc04a-9a13-434f-a3d0-47f1d8f39670',detail:{}});
        window.__creatorEditing=false;return {data:{active:false,expires_at:null},error:null};
      }
      if (fn === 'gestlok_molino_orders_state' || fn === 'gestlok_molino_order_create' || fn === 'gestlok_molino_order_ack'){
        if(window.__tenantOverride!=='6c8717ea-5f78-426b-9458-74a5dcac6e4e'||!a)
          return {data:null,error:{code:'42501',message:'Sin autorización'}};
        const scope=a.rol==='creadora'?'admin':a.rol==='dueno'?'dueno':
          (window.__molinoBranchOverride==='acassuso'?'acassuso':'san_isidro');
        const canCreate=['admin','dueno','acassuso'].includes(scope);
        const canAck=['admin','dueno','san_isidro'].includes(scope);
        const orders=window.__molinoOrders||(window.__molinoOrders=[]);
        if(fn==='gestlok_molino_orders_state')
          return {data:{scope,origin:'acassuso',destination:'san_isidro',can_create:canCreate,can_ack:canAck,
            orders:orders.slice()},error:null};
        if(fn==='gestlok_molino_order_create'){
          if(!canCreate)return {data:null,error:{code:'42501',message:'Solo Acassuso realiza pedidos'}};
          const lines=args?.p_items;
          if(!Array.isArray(lines)||!lines.length||lines.length>40)
            return {data:null,error:{code:'22023',message:'Pedido inválido'}};
          const request='mock-pedido-'+Date.now();
          lines.forEach((p,i)=>orders.unshift({
            id:request+'-'+i,request_id:request,day:new Date().toISOString().slice(0,10),
            product:p.product,quantity:p.quantity,note:p.note||'',requested_at:new Date().toISOString(),
            seen_at:null,seen_by:null
          }));
          return {data:{request_id:request,items:lines.length},error:null};
        }
        if(!canAck)return {data:null,error:{code:'42501',message:'Solo San Isidro marca OK'}};
        const item=orders.find(x=>x.id===args?.p_id);
        if(!item)return {data:null,error:{code:'42501',message:'Pedido inexistente'}};
        item.seen_at=item.seen_at||new Date().toISOString();item.seen_by='mock-sanisidro';
        return {data:{...item},error:null};
      }
      if (['gestlok_molino_save_price_basis','gestlok_molino_save_return',
        'gestlok_molino_acknowledge','gestlok_molino_returns_month'].includes(fn)){
        if(window.__tenantOverride!=='6c8717ea-5f78-426b-9458-74a5dcac6e4e'||!a)
          return {data:null,error:{code:'42501',message:'Sin autorización'}};
        const scope=a.rol==='creadora'?'admin':a.rol==='dueno'?'dueno':
          (window.__molinoBranchOverride==='acassuso'?'acassuso':'san_isidro');
        const canCreate=['admin','dueno','acassuso'].includes(scope);
        const canAck=['admin','dueno','san_isidro'].includes(scope);
        const canPrice=['admin','dueno','san_isidro'].includes(scope);
        const prices=window.__molinoPrices||(window.__molinoPrices=[]);
        const returned=window.__molinoReturns||(window.__molinoReturns=[]);
        if(fn==='gestlok_molino_save_price_basis'){
          if(!canPrice)return {data:null,error:{code:'42501',message:'Solo San Isidro carga Precios'}};
          if(!['unidad','kg'].includes(args?.p_basis))return {data:null,error:{message:'Base de precio inválida'}};
          const price={id:args.p_id||'price-'+(prices.length+1),product:args.p_product,
           amount:Number(args.p_amount),price_basis:args.p_basis,active:true,updated_at:new Date().toISOString()};
          const i=prices.findIndex(p=>p.id===price.id);if(i<0)prices.push(price);else prices[i]=price;
          return {data:price,error:null};
        }
        if(fn==='gestlok_molino_save_return'){
          if(!canCreate)return {data:null,error:{code:'42501',message:'Solo Acassuso devuelve'}};
          const price=prices.find(p=>p.product.toLowerCase()===String(args?.p_product||'').trim().toLowerCase());
          const unit=args?.p_unit;const qty=Number(args?.p_quantity);
          if(!price||!['kg','g','unidad'].includes(unit)||qty<=0||!Number.isFinite(qty))
            return {data:null,error:{message:'Precio o cantidad inválidos'}};
          if((unit==='unidad')!==(price.price_basis==='unidad'))
            return {data:null,error:{message:'La unidad no coincide con el precio'}};
          const gross=Math.round(price.amount*(unit==='g'?qty/1000:qty)*100)/100;
          const discount=Math.round(gross*33)/100;
          const entry={id:args?.p_id||'return-'+(returned.length+1),day:new Date().toISOString().slice(0,10),
            kind:'devolucion',product:price.product,quantity:qty,unit,note:args?.p_note||'',
            unit_price:price.amount,price_basis:price.price_basis,gross_total:gross,
            discount_rate:.33,discount_amount:discount,net_total:Math.round((gross-discount)*100)/100,
            acknowledged_at:null};
          const pos=returned.findIndex(x=>x.id===entry.id);
          if(pos>=0){if(returned[pos].acknowledged_at)return {data:null,error:{code:'42501',message:'Ya confirmó San Isidro'}};returned[pos]=entry;}
          else returned.push(entry);
          return {data:entry,error:null};
        }
        if(fn==='gestlok_molino_acknowledge'){
          if(!canAck)return {data:null,error:{code:'42501',message:'Solo San Isidro marca OK'}};
          const row=returned.find(x=>x.id===args?.p_id);
          if(!row)return {data:null,error:{code:'42501',message:'No encontrado'}};
          row.acknowledged_at=row.acknowledged_at||new Date().toISOString();
          row.acknowledgement_note=args?.p_note||'';
          return {data:row,error:null};
        }
        if(fn==='gestlok_molino_returns_month'){
          const month=String(args?.p_month||'');
          const selected=returned.filter(x=>x.day.startsWith(month));
          const groups={};
          for(const x of selected)(groups[x.day]||(groups[x.day]=[])).push(x);
          const sum=(arr,key)=>Math.round(arr.reduce((total,x)=>total+Number(x[key]||0),0)*100)/100;
          return {data:{month,total_items:selected.length,unpriced_items:0,gross:sum(selected,'gross_total'),
            discount:sum(selected,'discount_amount'),net:sum(selected,'net_total'),
            days:Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).map(([day,rows])=>({
              day,items:rows.length,gross:sum(rows,'gross_total'),discount:sum(rows,'discount_amount'),
              net:sum(rows,'net_total'),details:rows.map(x=>({
                product:x.product,quantity:x.quantity,unit:x.unit,unit_price:x.unit_price,
                price_basis:x.price_basis,gross:x.gross_total,discount:x.discount_amount,
                net:x.net_total,acknowledged_at:x.acknowledged_at
              }))
            }))},error:null};
        }
      }
      if (fn === 'gestlok_molino_state' || fn === 'gestlok_molino_history'){
        if(window.__tenantOverride!=='6c8717ea-5f78-426b-9458-74a5dcac6e4e'||!a)return {data:null,error:{code:'42501',message:'Sin autorización'}};
        const scope=a.rol==='creadora'?'admin':a.rol==='dueno'?'dueno':(window.__molinoBranchOverride==='acassuso'?'acassuso':'san_isidro');
        return {data:{scope,day:new Date().toISOString().slice(0,10),closed:false,prices:window.__molinoPrices||[],envios:[],devoluciones:window.__molinoReturns||[],history:[]},error:null};
      }
      if (fn === 'gestlok_creator_audit'){
        if(a?.rol!=='creadora')return {data:null,error:{code:'42501',message:'Sin permiso'}};
        return {data:window.__audit||[],error:null};
      }
      if (fn === 'gestlok_owner_area_context'){
        if(window.__ownerAreaFail)return {data:null,error:{message:'No disponible'}};
        if(a?.rol!=='dueno')return {data:null,error:{code:'42501',message:'Solo dueños'}};
        const brand=a.logoId==='mi-gusto'||rows.some(r=>r.col==='equipo'&&r.data?.rol==='dueno'&&r.data?.logoId==='mi-gusto');return {data:{role:'dueno',tenant_id:window.__tenantOverride||'cb0dc04a-9a13-434f-a3d0-47f1d8f39670',company_name:window.__companyOverride||(brand?'Mi Gusto':'Empresa de prueba'),logo_id:brand?'mi-gusto':null,local_ids:rows.filter(r=>r.col==='locales').map(r=>r.id),recibonet:window.__staffModule?{organization_number:'2099001',internal_name:'Fixture interna'}:null,modules:{comercial:{authorized:true,operational:true},recibos_personal:window.__staffModule?{authorized:true,operational:true,authority:'creator_module_grant'}:{authorized:false,operational:true,reason:'module_not_enabled'}}},error:null};
      }
      // Reseñas (igual que las RPC gestlok_resenas_*): Munro y Torcuato con datos propios; se registra cualquier día
      // y se usa del 1 al 12 (después del 12 vale el mes siguiente); uso único; modificar solo pendientes.
      // window.__resenasDia fija el día (AAAA-MM-DD) para probar vigencia y vencimiento.
      if (/^gestlok_resenas_(list|create|redeem|update|manual_use)$/.test(fn)){
        const loc = args && args.p_local, err = m => ({data:null, error:{message:m}});
        if (!a || !['munro','torcuato'].includes(loc) || !(total(a) || (a.rol === 'gerente' && (a.locales || []).includes(loc)))) return err('Acceso denegado');
        const dia = window.__resenasDia || new Date().toISOString().slice(0,10), y = Number(dia.slice(0,4)), m = Number(dia.slice(5,7)), d = Number(dia.slice(8));
        const per = d <= 12 ? dia.slice(0,8) + '01' : (m === 12 ? (y + 1) + '-01-01' : y + '-' + String(m + 1).padStart(2,'0') + '-01');
        const st = window.__resenas = window.__resenas || [];
        const vigente = c => dia >= c.period && dia <= c.period.slice(0,8) + '12';
        const vencido = c => dia > c.period.slice(0,8) + '12';
        const pay = c => ({...c, valid_from:c.period, usable:!c.used_at && vigente(c), status: c.used_at ? 'used' : (vencido(c) ? 'expired' : 'pending')});
        const tel = v => { let t = String(v || '').replace(/\D/g, ''); if (t.startsWith('0054')) t = t.slice(4); else if (t.startsWith('54') && t.length > 11) t = t.slice(2);
          if (t.length === 11 && t.startsWith('9')) t = t.slice(1); if (t.startsWith('0')) t = t.slice(1); return /^\d{10}$/.test(t) ? t : null; };
        if (fn === 'gestlok_resenas_list') return {data: st.filter(c => c.local === loc).slice().reverse().map(pay), error:null};
        if (fn === 'gestlok_resenas_create'){
          const t = tel(args.p_phone); if (!t || String(args.p_name || '').trim().length < 2) return err('Teléfono argentino inválido');
          if (st.some(c => c.local === loc && c.phone === t && c.period === per)) return err('El cliente ya tiene cupón para este período en esta sucursal');
          const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code;
          do { code = Array.from({length:6}, () => A[Math.floor(Math.random() * 32)]).join(''); } while (st.some(c => c.code === code));
          const c = {id:'cup-' + (st.length + 1), local:loc, customer_name:String(args.p_name).trim(), phone:t, code, period:per, discount:10, created_at:new Date().toISOString(), used_at:null};
          st.push(c); return {data:pay(c), error:null};
        }
        const c = st.find(x => x.id === args.p_id && x.local === loc);
        if (fn === 'gestlok_resenas_update'){
          const t = tel(args.p_phone); if (!t || String(args.p_name || '').trim().length < 2) return err('Nombre inválido');
          if (!c || c.used_at || vencido(c)) return err('Solo se modifican cupones pendientes de esta sucursal');
          if (st.some(x => x !== c && x.local === loc && x.phone === t && x.period === c.period)) return err('El cliente ya tiene cupón para este período en esta sucursal');
          c.customer_name = String(args.p_name).trim(); c.phone = t; return {data:pay(c), error:null};
        }
        if (fn === 'gestlok_resenas_manual_use') {
          const reason = String(args.p_reason || '').trim();
          if (reason.length < 8 || reason.length > 300) return err('Explicá el motivo del cambio');
          if (!c || c.used_at || vigente(c)) return err('Cupón ya utilizado, de otra sucursal o vigente');
          c.used_at = new Date().toISOString();
          c.manual_reason = reason;
          return {data:pay(c), error:null};
        }
        if (c && !c.used_at && dia < c.period) return err('Todavía no está vigente: se usa del 1 al 12 de ' + c.period.slice(5,7) + '/' + c.period.slice(0,4));
        if (!c || c.used_at || !vigente(c)) return err('Cupón utilizado, vencido, de otra sucursal o inexistente');
        c.used_at = new Date().toISOString(); return {data:pay(c), error:null};
      }
      if (fn === 'mi_rol') return {data: a ? a.rol : null, error:null};
      if (fn === 'mi_acceso') return {data: a ? {rol:a.rol, locales: total(a) ? rows.filter(r => r.col === 'locales').map(r => r.id) : (a.locales || []), tenant_id: window.__tenantOverride || 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'} : null, error:null};
      if (fn === 'pedir_acceso'){ if (a) return {data:a.rol, error:null}; const id = me(); if (!rows.some(r => r.col === 'solicitudes' && r.id === id)) rows.push({col:'solicitudes', id, data:{email:id, nombre:args.p_nombre || '', proveedor:args.p_proveedor || '', fecha:Date.now()}}); notify('solicitudes'); return {data:'pendiente', error:null}; }
      if (fn === 'gestlok_proveedor_guardar_historial'){
        const local=String(args?.p_local||''), id=String(args?.p_proveedor_id||'');
        const col=local+'/proveedores';
        if(!a || !canWrite(col))return {data:null,error:{code:'42501',message:'Sin permiso para guardar pedidos.'}};
        const productos=args?.p_productos,items=args?.p_items,catalogo=args?.p_catalogo;
        if(!id.startsWith('p-') || !Array.isArray(productos)||!productos.length||
           !Array.isArray(items)||!catalogo||Array.isArray(catalogo)||typeof catalogo!=='object'||
           productos.some(p=>!p.nombre||!Number.isFinite(Number(p.pedir))||Number(p.pedir)<=0))
          return {data:null,error:{message:'Pedido inválido'}};
        let ficha=rows.find(r=>r.col===col&&r.id===id);
        if(!ficha){
          const nombre=String(productos[0]?.proveedor||'').trim();
          if(Number(args.p_version||0)!==0||nombre.length<2||nombre.length>90)
            return {data:null,error:{message:'No se encontró la carpeta del proveedor.'}};
        }
        const actual=Number(ficha?.data?.pedidoActualizado||0);
        if(actual!==Number(args.p_version||0))
          return {data:null,error:{message:'Otro usuario actualizó el pedido. Recargá antes de guardarlo.'}};
        const stamp=Math.max(Date.now(),actual+1);
        if(!ficha){
          ficha={col,id,data:{nombre:productos[0].proveedor,contacto:'',telefono:'',
            entrega:'',nota:'',items:[],catalogo:{},pedidoActualizado:0}};
          rows.push(ficha);
        }
        ficha.data={...ficha.data,items:JSON.parse(JSON.stringify(items)),
          catalogo:JSON.parse(JSON.stringify(catalogo)),pedidoActualizado:stamp,pedidoPor:me()};
        const historialId='pedido-test-'+stamp+'-'+rows.length;
        rows.push({col:local+'/proveedores_historial',id:historialId,data:{
          proveedorId:id,proveedor:ficha.data.nombre,productos:JSON.parse(JSON.stringify(productos)),
          fecha:stamp,autor:me(),version:stamp,local
        }});
        window.__log.push(['rpc:proveedores',local,id,historialId]);
        notify(col);notify(local+'/proveedores_historial');
        return {data:{pedidoActualizado:stamp,historialId},error:null};
      }
      if (fn === 'doc_update'){ if (!canWrite(args.p_col)) return {data:0, error:null}; const r = rows.find(x => x.col === args.p_col && x.id === args.p_id); if (!r) return {data:0, error:null}; r.data = keepSug(args.p_col, r.data, {...r.data, ...args.p_patch}); window.__log.push(['update', args.p_col, args.p_id]); notify(args.p_col); return {data:1, error:null}; }
      if (fn === 'importar_mercaderia') return importar(a, args);
      return {data:null, error:null};
    },
    channel(){ const ch = { on(_e, f, cb){ subs.push({col:f.filter.split('eq.')[1], cb}); return ch; }, subscribe(){ return ch; } }; return ch; },
    removeChannel(){}
  }; } };
})();
