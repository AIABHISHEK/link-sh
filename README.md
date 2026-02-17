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
