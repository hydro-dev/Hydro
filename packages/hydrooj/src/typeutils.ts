export type NumberKeys<O> = {
    [K in keyof O]: number extends O[K] ? K : never
}[keyof O];
export type ArrayKeys<O, P = any> = {
    [K in keyof O]: P[] extends O[K] ? K : never
}[keyof O];
export type Value<O, V = ''> = {
    [K in keyof O]: V
};
export type Projection<O> = (string & keyof O)[];
export type Omit<T, K> = Pick<T, Exclude<keyof T, K>>;
export type Filter<T, U> = T extends U ? T : never;
export type MaybeArray<T> = T | T[];
