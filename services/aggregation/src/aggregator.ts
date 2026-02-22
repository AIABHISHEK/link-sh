import geoip from "geoip-lite";
import { UAParser } from "ua-parser-js";

export class AggregationContext {
    total = new Map<string, number>();
    hourly = new Map<string, number>();
    country = new Map<string, number>();
    device = new Map<string, number>();

    process(event: {
        shortCode: string;
        timestamp: number;
        ip?: string;
        userAgent?: string;
    }) {
        const { shortCode, timestamp, ip, userAgent } = event;

        if (!shortCode || !timestamp) return;

        this.increment(this.total, shortCode);

        const dateObj = new Date(timestamp);
        const date = dateObj.toISOString().slice(0, 10);
        const hour = dateObj.getUTCHours();

        this.increment(this.hourly, `${shortCode}:${date}:${hour}`);

        let countryCode = "UN";
        if (ip) {
            const geo = geoip.lookup(ip);
            if (geo?.country) countryCode = geo.country;
        }

        this.increment(this.country, `${shortCode}:${countryCode}`);

        let deviceType = "desktop";
        if (userAgent) {
            const parser = new UAParser(userAgent);
            const parsed = parser.getDevice().type;
            if (parsed === "mobile") deviceType = "mobile";
            else if (parsed === "tablet") deviceType = "tablet";
        }

        this.increment(this.device, `${shortCode}:${deviceType}`);
    }

    private increment(map: Map<string, number>, key: string) {
        map.set(key, (map.get(key) || 0) + 1);
    }
}
