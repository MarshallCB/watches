declare class Watcher{
  on(event: string, callback: (path: string, ...args: any) => void): Watcher
}

export declare function watch(source: string, options?: {ignore: RegExp, only: RegExp, chokidar: any, cache: any}): Watcher;

export declare function targets(source: string, ignore?: RegExp, only?: RegExp): [{ rel: string, id: string }];