// Based on https://github.com/QAQrz/Codeforces-Rating-System/blob/master/rating.py

class User {
    uid: number;
    rank: number;
    old: number;
    seed?: number;
    delta?: number;
    new?: number;

    constructor(rank: number, old: number, uid = 0) {
        this.rank = rank;
        this.old = old;
        this.seed = 1;
        this.uid = uid;
    }
}

class RatingCalculator {
    users: User[];

    constructor(users: User[]) {
        this.users = [];
        for (const user of users) {
            this.users.push(new User(user.rank, user.old, user.uid));
        }
    }

    calP(a: User, b: User) {
        return 1 / (1 + 10 ** ((b.old - a.old) / 400));
    }

    getExSeed(rating: number, ownUser: User) {
        const exUser = new User(0.0, rating);
        let result = 1;
        for (const user of this.users) {
            if (user !== ownUser) result += this.calP(user, exUser);
        }
        return result;
    }

    calRating(rank: number, user: User) {
        let left = 1;
        let right = 8000;
        while (right - left > 1) {
            const mid = Math.floor((left + right) / 2);
            if (this.getExSeed(mid, user) < rank) right = mid;
            else left = mid;
        }
        return left;
    }

    calculate() {
        // Calculate seed
        for (let i = 0; i < this.users.length; i++) {
            this.users[i].seed = 1;
            for (let j = 0; j < this.users.length; j++) {
                if (i !== j) {
                    this.users[i].seed += this.calP(this.users[j], this.users[i]);
                }
            }
        }
        // Calculate initial delta and sum_delta
        let sumDelta = 0;
        for (const user of this.users) {
            user.delta = (this.calRating(Math.sqrt(user.rank * user.seed), user) - user.old) / 2;
            sumDelta += user.delta;
        }
        // Calculate first inc
        let inc = Math.floor(-sumDelta / this.users.length) - 1;
        for (const user of this.users) user.delta += inc;
        // Calculate second inc
        this.users = this.users.sort((a, b) => b.old - a.old);
        const s = Math.min(
            this.users.length,
            Math.floor(4 * Math.round(Math.sqrt(this.users.length))),
        );
        let sumS = 0;
        for (let i = 0; i < s; i++) {
            sumS += this.users[i].delta;
        }
        inc = Math.min(Math.max(Math.floor(-sumS / s), -10), 0);
        // Calculate new rating
        for (const user of this.users) {
            user.delta += inc;
            user.new = user.old + user.delta;
        }
        this.users = this.users.sort((a, b) => a.rank - b.rank);
        return this.users;
    }
}

interface RatingInputUser {
    old: number;
    uid: number;
    rank: number;
}

interface RatingOutputUser {
    new: number;
    uid: number;
}

function calculate(users: RatingInputUser[]): RatingOutputUser[] {
    let lastIdx = 0;
    let lastRank = 1;
    for (let i = 1; i < users.length; i++) {
        if (users[i].rank > lastRank) {
            for (let j = lastIdx; j < i; j++) users[j].rank = i;
            lastIdx = i;
            lastRank = users[i].rank;
        }
    }
    for (let i = lastIdx; i < users.length; i++) {
        users[i].rank = users.length;
    }
    const calculator = new RatingCalculator(users);
    return calculator.calculate() as RatingOutputUser[];
}

export default calculate;
