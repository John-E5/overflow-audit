export declare function page(body: string): string;
export declare function serveFixtures(port?: number): Promise<{ url: string; close(): Promise<void> }>;
