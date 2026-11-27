# Tests Prime (base locale)

Les tests du calcul de livraison Prime tournent sur une base PostgreSQL **locale**, jamais sur la production.

1. `prime_local_db.py` (à adapter : il lit `stub_tables.sql`, `cities.sql`, `stub_funcs.sql` et `sample.json`,
   exportés en lecture seule depuis la structure de production) génère `build.sql`.
2. `psql -d primetest -f build.sql` puis `psql -d primetest -f ../integration-prime-livraison-incluse.sql`.
3. `psql -d primetest -f prime-livraison.test.sql` : chaque ligne doit afficher `OK`, et `echecs = 0`.

Le test s'exécute dans une transaction annulée (`rollback`) : la base de test n'est pas modifiée.
