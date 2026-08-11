export interface HourlyClickRow {
    date: string;
    hour: number;
    clickCount: string;
}

export interface CountryClickRow {
    country: string;
    clickCount: string;
}

export interface DeviceClickRow {
    deviceType: string;
    clickCount: string;
}

export interface AnalyticsDateRange {
    from: Date;
    to: Date;
}
