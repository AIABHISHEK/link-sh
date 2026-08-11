exports.up = (pgm) => {
    pgm.addColumn("links", {
        user_id: {
            type: "text",
            notNull: false,
        },
        deleted_at: {
            type: "timestamp",
            notNull: false,
        },
    });

    // Pre-existing rows predate ownership; attribute them to a legacy owner
    // rather than leaving user_id nullable going forward.
    pgm.sql(`UPDATE links SET user_id = 'legacy' WHERE user_id IS NULL`);

    pgm.alterColumn("links", "user_id", { notNull: true });

    pgm.createIndex("links", ["user_id", "deleted_at"]);
};

exports.down = (pgm) => {
    pgm.dropIndex("links", ["user_id", "deleted_at"]);
    pgm.dropColumn("links", ["user_id", "deleted_at"]);
};
