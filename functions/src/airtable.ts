import axios from "axios";
import dayjs = require("dayjs");

import { AirTableRecord } from "../../src/types";
import { born2winApiKey, mainBase, bucket } from ".";

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

export async function AirTableDelete(tableName: string, id: string) {
    const url = `https://api.airtable.com/v0/${mainBase.value()}/${encodeURIComponent(tableName)}/${id}`;

    const apiKey = born2winApiKey.value();

    const headers = {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
    };

    return axios.delete(url, {
        headers,
    }).then(res => res.data);
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
interface CacheMetadata {
    lastFetched: number; // Timestamp in milliseconds
    etag: string; // ETag for cache validation
}

export class CachedAirTable<T> {
    private cachedData: T[] | undefined = undefined;
    private lastFetched = 0;
    private filters: string[];
    private query: AirTableQuery<T>;
    private cachedFilePath: string;
    private cacheMetadata: CacheMetadata | undefined = undefined;
    private isFetching = false;
    private fetchPromise: Promise<T[]> | null = null;

    /**
     * Constructor for CachedAirTable
     * @param tableName - Name of the Airtable table
     * @param mapper - Function to map Airtable records to type T
     * @param filters - Array of filter strings for Airtable queries
     * @param cacheFileName - Optional custom cache file name
     */
    constructor(
        tableName: string,
        mapper: (record: AirTableRecord) => T,
        filters: string[],
        cacheFileName?: string
    ) {
        this.filters = filters;
        this.query = new AirTableQuery<T>(tableName, mapper);
        this.cachedFilePath = cacheFileName ?
            `cache/${cacheFileName}.json` :
            `cache/${tableName}.json`; // Default cache file path
    }

    /**
     * Retrieves cached data or fetches new data from Airtable if cache is invalid or absent.
     * Utilizes both Firebase Storage and in-memory caching.
     * @param filterFromCache - Optional filter function to apply to cached data
     * @returns Promise resolving to an array of type T
     */
    async get(filterFromCache?: (t: T) => boolean): Promise<T[]> {
        const file = bucket.file(this.cachedFilePath);

        // read etag
        const metadata = await file.getMetadata().catch(() => {
            // kept blank as expected (file does not exists)
        });

        if (metadata) {
            const currentETag = metadata[0].etag;
            if (this.cachedData && this.cacheMetadata && currentETag === this.cacheMetadata.etag) {
                // Cache is consistent
                console.info(`In-memory cache valid for ${this.cachedFilePath}.`);
                return filterFromCache ? this.cachedData.filter(filterFromCache) : this.cachedData;
            } else {
                console.info(`New Cached file inconsistency detected for ${this.cachedFilePath}. Reloading cache.`);
                // Invalidate in-memory cache
                this.cachedData = undefined;
                this.cacheMetadata = undefined;
            }
        } else {
            console.info(`Cache file ${this.cachedFilePath} no longer exists. Reloading cache.`);
            // Invalidate in-memory cache
            this.cachedData = undefined;
            this.cacheMetadata = undefined;
        }

        // If a fetch is already in progress, wait for it
        if (this.isFetching && this.fetchPromise) {
            console.log(`Fetch in progress for ${this.cachedFilePath}. Waiting for existing fetch.`);
            return this.fetchPromise;
        }

        // Start fetching data
        this.isFetching = true;
        this.fetchPromise = this.fetchData(metadata != undefined, filterFromCache)
            .finally(() => {
                // Reset fetching state
                this.isFetching = false;
                this.fetchPromise = null;
            });
        const result = await this.fetchPromise;
        return result;
    }


    /**
     * Fetches data from Firebase Storage or Airtable, updates in-memory cache.
     * @param filterFromCache - Optional filter function
     * @returns Promise resolving to an array of type T
     */
    private async fetchData(exists: boolean, filterFromCache?: (t: T) => boolean): Promise<T[]> {
        const now = dayjs();
        const file = bucket.file(this.cachedFilePath);
        if (exists) {
            // Fetch file metadata
            const [metadata] = await file.getMetadata();

            // Download and parse cached data
            console.log(`Loading cached data from ${this.cachedFilePath}.`);
            const [contents] = await file.download();
            const cacheJson = JSON.parse(contents.toString("utf-8")) as CacheMetadata & { data: T[] };

            this.cachedData = cacheJson.data;
            this.lastFetched = cacheJson.lastFetched;
            this.cacheMetadata = {
                lastFetched: cacheJson.lastFetched,
                etag: metadata.etag || "",
            };

            return filterFromCache ? this.cachedData.filter(filterFromCache) : this.cachedData;
        } else {
            console.info(`Cache file ${this.cachedFilePath} does not exist. Fetching data from Airtable.`);
        }

        // Fetch data from Airtable
        const fetchedData: T[] = await this.query.execute(this.filters);

        // Prepare cache content
        const cacheContent = {
            data: fetchedData,
            lastFetched: now.valueOf(), // Timestamp in milliseconds
        };

        // Save cache to Firebase Storage
        await file.save(JSON.stringify(cacheContent), {
            contentType: "application/json",
        });

        // Fetch updated metadata
        const [updatedMetadata] = await file.getMetadata();

        // Update in-memory cache
        this.cachedData = fetchedData;
        this.lastFetched = now.valueOf();
        this.cacheMetadata = {
            lastFetched: this.lastFetched,
            etag: updatedMetadata.etag || "",
        };

        console.log(`Cache updated for ${this.cachedFilePath}.`);

        return filterFromCache ? this.cachedData.filter(filterFromCache) : this.cachedData;
    }


    /**
     * Evicts the cached data by deleting the cache file from Firebase Storage and clearing in-memory cache.
     */
    async evict(): Promise<void> {
        const file = bucket.file(this.cachedFilePath);

        try {
            await file.delete();
            console.log(`Cache evicted: ${this.cachedFilePath} has been deleted.`);
        } catch (error: any) {
            if (error.code === 404) {
                console.warn(`Cache file ${this.cachedFilePath} does not exist.`);
            } else {
                console.error(`Error evicting cache file ${this.cachedFilePath}:`, error);
                throw error; // Rethrow to let the caller handle the error
            }
        }

        // Clear in-memory cache
        this.cachedData = undefined;
        this.cacheMetadata = undefined;
        this.lastFetched = 0;
    }
}