export type Atomic = number | string | boolean | bigint | symbol | Date | any[];
export type Values<S> = S[keyof S];
export type Intersect<U> = (U extends any ? (arg: U) => void : never) extends ((arg: infer I) => void) ? I : never;
export type NumberKeys<O> = {
    [K in keyof O]: number extends O[K] ? K : never
}[keyof O];
export type ArrayKeys<O, P = any> = {
    [K in keyof O]: P[] extends O[K] ? K : never
}[keyof O];
type FlatWrap<S, T, P extends string> = { [K in P]?: S } | (S extends T ? never // rule out atomic / recursive types
    : S extends any[] ? never // rule out array types
        : string extends keyof S ? never // rule out dict / infinite types
            : FlatMap<S, T, `${P}.`>);
type FlatMap<S, T = Atomic, P extends string = ''> = Values<{
    [K in keyof S & string as `${P}${K}`]: FlatWrap<S[K], S | T, `${P}${K}`>
}>;
export type Flatten<S> = Intersect<FlatMap<S>>;
export type Value<O, V = ''> = {
    [K in keyof O]: V
};
export type Projection<O> = readonly (string & keyof O)[];
export type Omit<T, K> = Pick<T, Exclude<keyof T, K>>;
export type MaybeArray<T> = T | T[];
export type UnionToIntersection<U> = (U extends any ? (arg: U) => void : never) extends ((arg: infer I) => void) ? I : never;
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
