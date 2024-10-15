import axios from "axios";
import dayjs = require("dayjs");

import { AirTableRecord } from "../../src/types";
import { born2winApiKey, mainBase } from ".";


export async function AirTableGet<T>(tableName: string, id: string, mapper: (t: AirTableRecord) => T): Promise<T> {
    const url = `https://api.airtable.com/v0/${mainBase.value()}/${encodeURIComponent(tableName)}/${id}`;

    const apiKey = born2winApiKey.value();

    const headers = {
        Authorization: `Bearer ${apiKey}`,
    };

    const response: any = await axios.get(url, {
        headers,
    }).catch(err => {
        console.log("Error AirTableGet", err);
    });
    return mapper(response.data);
}

export async function AirTableInsert(tableName: string, records: any) {
    const url = `https://api.airtable.com/v0/${mainBase.value()}/${encodeURIComponent(tableName)}`;

    const apiKey = born2winApiKey.value();

    const headers = {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
    };

    return axios.post(url, records, {
        headers,
    });
}

export async function AirTableUpdate(tableName: string, id: string, updates: any) {
    const url = `https://api.airtable.com/v0/${mainBase.value()}/${encodeURIComponent(tableName)}/${id}`;

    const apiKey = born2winApiKey.value();

    const headers = {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
    };

    return axios.patch(url, updates, {
        headers,
    });
}

export class AirTableQuery<T> {
    private tableName: string;
    private mapper: (record: AirTableRecord) => T;

    constructor(tableName: string, mapper: (record: AirTableRecord) => T) {
        this.tableName = tableName;
        this.mapper = mapper;
    }

    async execute(filters?: string[]): Promise<T[]> {
        const url = `https://api.airtable.com/v0/${mainBase.value()}/${encodeURIComponent(this.tableName)}`;

        let offset: string | undefined;
        const apiKey = born2winApiKey.value();

        const headers = {
            Authorization: `Bearer ${apiKey}`,
        };
        let results: T[] = [];

        do {
            const params: any = { offset };
            if (filters && filters.length > 0) {
                params.filterByFormula = `AND(${filters.join(",")})`;
            }
            const response: any = await axios.get(url, {
                headers,
                params,
            }).catch(err => {
                console.log("Error AirTableQuery", err);
            });

            offset = response.data.offset;
            if (response.data.records) {
                results = results.concat(response.data.records.map((record: AirTableRecord) => this.mapper(record)));
            }
        } while (offset);

        return results;
    }
}


export class CachedAirTable<T> {
    private cachedData: T[] | undefined = undefined;
    private cacheDurationMinutes = 60;
    private lastFetched = 0;
    private filters: string[];
    private query: AirTableQuery<T>;

    constructor(tableName: string, mapper: (record: AirTableRecord) => T, filters: string[], cacheDurationMinutes?: number) {
        this.filters = filters;

        if (cacheDurationMinutes !== undefined) {
            this.cacheDurationMinutes = cacheDurationMinutes;
        }
        this.query = new AirTableQuery<T>(tableName, mapper);
    }

    async get(filterFromCache?: (t: T) => boolean): Promise<T[]> {
        const now = dayjs();
        if (this.cachedData && this.lastFetched && dayjs(this.lastFetched).add(this.cacheDurationMinutes, "minutes").isAfter(now)) {
            return filterFromCache ? this.cachedData.filter(filterFromCache) : this.cachedData;
        }

        this.cachedData = await this.query.execute(this.filters);
        this.lastFetched = now.valueOf();
        return filterFromCache ? this.cachedData.filter(filterFromCache) : this.cachedData;
    }
}