# link-sh

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

To migrate:

```bash
bun run migrate:up
```

### folder struture;
link-shortener/
│
├── services/
│   │
│   ├── redirect-service/
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── routes/
│   │   │   │   ├── create.ts
│   │   │   │   └── redirect.ts
│   │   │   ├── kafka/
│   │   │   │   └── producer.ts
│   │   │   ├── db.ts
│   │   │   ├── redis.ts
│   │   │   ├── config.ts
│   │   │   └── logger.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── aggregator-service/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── kafka/
│   │   │   │   └── consumer.ts
│   │   │   ├── aggregator.ts
│   │   │   ├── db.ts
│   │   │   ├── config.ts
│   │   │   └── logger.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/
│       ├── types/
│       │   └── click-event.ts
│       ├── constants.ts
│       └── utils/
│           └── validate-url.ts
│
├── infrastructure/
│   ├── docker/
│   │   ├── redirect.Dockerfile
│   │   ├── aggregator.Dockerfile
│   │   └── docker-compose.dev.yml
│   │
│   ├── kafka/
│   │   └── create-topics.sh
│   │
│   └── migrations/
│       └── (node-pg-migrate files)
│
├── .env
├── package.json (workspace root)
└── README.md



#### Kafka Topic Bootstrap

Topic `link.clicks` is created automatically by the one-shot `kafka-init` service in Compose.

Run:
```
docker compose -f infra/docker/docker-compose.dev.yml -f infra/docker/docker-compose.dev.dev2.yml up -d --force-recreate link-redirect
```

Verify topic exists:
```
docker compose -f infra/docker/docker-compose.dev.yml -f infra/docker/docker-compose.dev.dev2.yml exec -T kafka bash -lc "/opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:29092 --list"
```


## Prometheus 
{job="otel-collector"}  query to get all available metrics-fields from otel-collector

## To run
```
docker compose -f infra/docker/docker-compose.dev.yml -f infra/docker/docker-compose.dev.dev2.yml up -d --force-recreate link-redirect
```
