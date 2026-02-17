exports.up = (pgm) => {
    pgm.addColumn('links', {
        expires_at: {
            type: 'timestamp',
            notNull: false,
        },
    });
};

exports.down = (pgm) => {
    pgm.dropColumn('links', 'expires_at');
};
