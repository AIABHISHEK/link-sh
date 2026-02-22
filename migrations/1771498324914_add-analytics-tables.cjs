exports.up = (pgm) => {
    pgm.addColumn("links", {
        click_count: {
            type: "bigint",
            default: 0,
        },
    });

    pgm.createTable("link_click_hourly", {
        short_code: { type: "varchar(10)", notNull: true },
        date: { type: "date", notNull: true },
        hour: { type: "int", notNull: true },
        click_count: { type: "bigint", default: 0 },
    });

    pgm.addConstraint(
        "link_click_hourly",
        "pk_link_click_hourly",
        "PRIMARY KEY(short_code, date, hour)"
    );

    pgm.createTable("link_click_country", {
        short_code: { type: "varchar(10)", notNull: true },
        country: { type: "varchar(2)", notNull: true },
        click_count: { type: "bigint", default: 0 },
    });

    pgm.addConstraint(
        "link_click_country",
        "pk_link_click_country",
        "PRIMARY KEY(short_code, country)"
    );

    pgm.createTable("link_click_device", {
        short_code: { type: "varchar(10)", notNull: true },
        device_type: { type: "varchar(20)", notNull: true },
        click_count: { type: "bigint", default: 0 },
    });

    pgm.addConstraint(
        "link_click_device",
        "pk_link_click_device",
        "PRIMARY KEY(short_code, device_type)"
    );
};
