export type LinkStatus = "active" | "expired" | "deleted";

export interface AuthenticatedUserContext {
    userId: string;
}

export interface DashboardLink {
    id: string;
    shortCode: string;
    shortUrl: string;
    destinationUrl: string;
    createdAt: string;
    expiresAt: string | null;
    status: LinkStatus;
}

export interface CreateLinkRequest {
    destinationUrl: string;
    expiresAt?: string | null;
}

export interface UpdateLinkRequest {
    destinationUrl?: string;
    expiresAt?: string | null;
}

export interface ListLinksResponse {
    items: DashboardLink[];
    nextCursor: string | null;
}

export type AnalyticsInterval = "hour" | "day";

export interface AnalyticsTimeseriesPoint {
    bucketStart: string;
    clicks: number;
}

export interface CountryBreakdownItem {
    country: string;
    clicks: number;
}

export interface DeviceBreakdownItem {
    deviceType: string;
    clicks: number;
}

export interface LinkAnalyticsOverview {
    summary: {
        totalClicks: number;
    };
    timeseries: AnalyticsTimeseriesPoint[];
    topCountries: CountryBreakdownItem[];
    topDevices: DeviceBreakdownItem[];
}

export interface LinkAnalyticsTimeseries {
    interval: AnalyticsInterval;
    points: AnalyticsTimeseriesPoint[];
}

export interface LinkAnalyticsCountries {
    items: CountryBreakdownItem[];
}

export interface LinkAnalyticsDevices {
    items: DeviceBreakdownItem[];
}
