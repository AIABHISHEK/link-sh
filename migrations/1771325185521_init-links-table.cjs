exports.up = (pgm) => {
    pgm.createTable('links', {
        id: {
            type: 'bigserial',
            primaryKey: true,
        },
        short_code: {
            type: 'varchar(10)',
            notNull: true,
            unique: true,
        },
        long_url: {
            type: 'text',
            notNull: true,
        },
        created_at: {
            type: 'timestamp',
            default: pgm.func('current_timestamp'),
        },
    });

    pgm.createIndex('links', 'short_code');
};

exports.down = (pgm) => {
    pgm.dropTable('links');
};
