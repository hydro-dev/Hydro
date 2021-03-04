// https://github.com/MikeMirzayanov/testlib/blob/master/testlib.h
#ifndef _TESTLIB_H_
#define _TESTLIB_H_
#define VERSION "0.9.24-SNAPSHOT"
#ifdef _MSC_VER
#define _CRT_SECURE_NO_DEPRECATE
#define _CRT_SECURE_NO_WARNINGS
#define _CRT_NO_VA_START_VALIDATION
#endif
#define random __random_deprecated
#include <algorithm>
#include <climits>
#include <cstdlib>
#include <stdlib.h>
#undef random
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fcntl.h>
#include <fstream>
#include <iostream>
#include <limits>
#include <map>
#include <set>
#include <sstream>
#include <stdarg.h>
#include <string>
#include <vector>
#if (_WIN32 || __WIN32__ || _WIN64 || __WIN64__ || __CYGWIN__)
#if !defined(_MSC_VER) || _MSC_VER > 1400
#define NOMINMAX 1
#include <windows.h>
#else
#define WORD unsigned short
#include <unistd.h>
#endif
#include <io.h>
#define ON_WINDOWS
#if defined(_MSC_VER) && _MSC_VER > 1400
#pragma warning(disable : 4127)
#pragma warning(disable : 4146)
#pragma warning(disable : 4458)
#endif
#else
#define WORD unsigned short
#include <unistd.h>
#endif
#if defined(FOR_WINDOWS) && defined(FOR_LINUX)
#error Only one target system is allowed
#endif
#ifndef LLONG_MIN
#define LLONG_MIN (-9223372036854775807LL - 1)
#endif
#ifndef ULLONG_MAX
#define ULLONG_MAX (18446744073709551615)
#endif
#define LF ((char)10)
#define CR ((char)13)
#define TAB ((char)9)
#define SPACE ((char)' ')
#define EOFC (255)
#ifndef OK_EXIT_CODE
#ifdef CONTESTER
#define OK_EXIT_CODE 0xAC
#else
#define OK_EXIT_CODE 0
#endif
#endif
#ifndef WA_EXIT_CODE
#ifdef EJUDGE
#define WA_EXIT_CODE 5
#elif defined(CONTESTER)
#define WA_EXIT_CODE 0xAB
#else
#define WA_EXIT_CODE 1
#endif
#endif
#ifndef PE_EXIT_CODE
#ifdef EJUDGE
#define PE_EXIT_CODE 4
#elif defined(CONTESTER)
#define PE_EXIT_CODE 0xAA
#else
#define PE_EXIT_CODE 2
#endif
#endif
#ifndef FAIL_EXIT_CODE
#ifdef EJUDGE
#define FAIL_EXIT_CODE 6
#elif defined(CONTESTER)
#define FAIL_EXIT_CODE 0xA3
#else
#define FAIL_EXIT_CODE 3
#endif
#endif
#ifndef DIRT_EXIT_CODE
#ifdef EJUDGE
#define DIRT_EXIT_CODE 6
#else
#define DIRT_EXIT_CODE 4
#endif
#endif
#ifndef POINTS_EXIT_CODE
#define POINTS_EXIT_CODE 7
#endif
#ifndef UNEXPECTED_EOF_EXIT_CODE
#define UNEXPECTED_EOF_EXIT_CODE 8
#endif
#ifndef PC_BASE_EXIT_CODE
#ifdef TESTSYS
#define PC_BASE_EXIT_CODE 50
#else
#define PC_BASE_EXIT_CODE 0
#endif
#endif
#ifdef __GNUC__
#define __TESTLIB_STATIC_ASSERT(condition) typedef void* __testlib_static_assert_type[(condition) ? 1 : -1] __attribute__((unused))
#else
#define __TESTLIB_STATIC_ASSERT(condition) typedef void* __testlib_static_assert_type[(condition) ? 1 : -1]
#endif
#ifdef ON_WINDOWS
#define I64 "%I64d"
#define U64 "%I64u"
#else
#define I64 "%lld"
#define U64 "%llu"
#endif
#ifdef _MSC_VER
#define NORETURN __declspec(noreturn)
#elif defined __GNUC__
#define NORETURN __attribute__((noreturn))
#else
#define NORETURN
#endif
static char __testlib_format_buffer[16777216];
static int __testlib_format_buffer_usage_count = 0;
#define FMT_TO_RESULT(fmt, cstr, result)                                           \
    std::string result;                                                            \
    if (__testlib_format_buffer_usage_count != 0)                                  \
        __testlib_fail("FMT_TO_RESULT::__testlib_format_buffer_usage_count != 0"); \
    __testlib_format_buffer_usage_count++;                                         \
    va_list ap;                                                                    \
    va_start(ap, fmt);                                                             \
    vsnprintf(__testlib_format_buffer, sizeof(__testlib_format_buffer), cstr, ap); \
    va_end(ap);                                                                    \
    __testlib_format_buffer[sizeof(__testlib_format_buffer) - 1] = 0;              \
    result = std::string(__testlib_format_buffer);                                 \
    __testlib_format_buffer_usage_count--;
const long long __TESTLIB_LONGLONG_MAX = 9223372036854775807LL;
bool __testlib_hasTestCase;
int __testlib_testCase = -1;
void setTestCase(int testCase) {
    __testlib_hasTestCase = true;
    __testlib_testCase = testCase;
}
void unsetTestCase() {
    __testlib_hasTestCase = false;
    __testlib_testCase = -1;
}
NORETURN static void __testlib_fail(const std::string& message);
template <typename T>
static inline T __testlib_abs(const T& x) {
    return x > 0 ? x : -x;
}
template <typename T>
static inline T __testlib_min(const T& a, const T& b) {
    return a < b ? a : b;
}
template <typename T>
static inline T __testlib_max(const T& a, const T& b) {
    return a > b ? a : b;
}
static bool __testlib_prelimIsNaN(double r) {
    volatile double ra = r;
#ifndef __BORLANDC__
    return ((ra != ra) == true) && ((ra == ra) == false) && ((1.0 > ra) == false) && ((1.0 < ra) == false);
#else
    return std::_isnan(ra);
#endif
}
static std::string removeDoubleTrailingZeroes(std::string value) {
    while (!value.empty() && value[value.length() - 1] == '0' && value.find('.') != std::string::npos)value = value.substr(0, value.length() - 1);
    return value + '0';
}
#ifdef __GNUC__
__attribute__((format(printf, 1, 2)))
#endif
std::string
format(const char* fmt, ...) {
    FMT_TO_RESULT(fmt, fmt, result);
    return result;
}
std::string format(const std::string fmt, ...) {
    FMT_TO_RESULT(fmt, fmt.c_str(), result);
    return result;
}
static std::string __testlib_part(const std::string& s);
static bool __testlib_isNaN(double r) {
    __TESTLIB_STATIC_ASSERT(sizeof(double) == sizeof(long long));
    volatile double ra = r;
    long long llr1, llr2;
    std::memcpy((void*)&llr1, (void*)&ra, sizeof(double));
    ra = -ra;
    std::memcpy((void*)&llr2, (void*)&ra, sizeof(double));
    long long llnan = 0xFFF8000000000000LL;
    return __testlib_prelimIsNaN(r) || llnan == llr1 || llnan == llr2;
}
static double __testlib_nan() {
    __TESTLIB_STATIC_ASSERT(sizeof(double) == sizeof(long long));
#ifndef NAN
    long long llnan = 0xFFF8000000000000LL;
    double nan;
    std::memcpy(&nan, &llnan, sizeof(double));
    return nan;
#else
    return NAN;
#endif
}
static bool __testlib_isInfinite(double r) {
    volatile double ra = r;
    return (ra > 1E300 || ra < -1E300);
}
#ifdef __GNUC__
__attribute__((const))
#endif
inline bool
doubleCompare(double expected, double result, double MAX_DOUBLE_ERROR) {
    if (__testlib_isNaN(expected)) {
        return __testlib_isNaN(result);
    } else if (__testlib_isInfinite(expected)) {
        if (expected > 0) {
            return result > 0 && __testlib_isInfinite(result);
        } else {
            return result < 0 && __testlib_isInfinite(result);
        }
    } else if (__testlib_isNaN(result) || __testlib_isInfinite(result)) {
        return false;
    } else if (__testlib_abs(result - expected) <= MAX_DOUBLE_ERROR + 1E-15) {
        return true;
    } else {
        double minv = __testlib_min(expected * (1.0 - MAX_DOUBLE_ERROR),
            expected * (1.0 + MAX_DOUBLE_ERROR));
        double maxv = __testlib_max(expected * (1.0 - MAX_DOUBLE_ERROR),
            expected * (1.0 + MAX_DOUBLE_ERROR));
        return result + 1E-15 >= minv && result <= maxv + 1E-15;
    }
}
#ifdef __GNUC__
__attribute__((const))
#endif
inline double
doubleDelta(double expected, double result) {
    double absolute = __testlib_abs(result - expected);
    if (__testlib_abs(expected) > 1E-9) {
        double relative = __testlib_abs(absolute / expected);
        return __testlib_min(absolute, relative);
    } else return absolute;
}
#if !defined(_MSC_VER) || _MSC_VER < 1900
#ifndef _fileno
#define _fileno(_stream) ((_stream)->_file)
#endif
#endif
#ifndef O_BINARY
static void __testlib_set_binary(
#ifdef __GNUC__
    __attribute__((unused))
#endif
    std::FILE* file)
#else
static void __testlib_set_binary(std::FILE* file)
#endif
{
#ifdef O_BINARY
    if (NULL != file) {
#ifndef __BORLANDC__
        _setmode(_fileno(file), O_BINARY);
#else
        setmode(fileno(file), O_BINARY);
#endif
}
#endif
}
class random_t;
class pattern {
public:
    pattern(std::string s);
    std::string next(random_t& rnd) const;
    bool matches(const std::string& s) const;
    std::string src() const;

private:
    bool matches(const std::string& s, size_t pos) const;
    std::string s;
    std::vector<pattern> children;
    std::vector<char> chars;
    int from;
    int to;
};
class random_t {
private:
    unsigned long long seed;
    static const unsigned long long multiplier;
    static const unsigned long long addend;
    static const unsigned long long mask;
    static const int lim;
    long long nextBits(int bits) {
        if (bits <= 48) {
            seed = (seed * multiplier + addend) & mask;
            return (long long)(seed >> (48 - bits));
        } else {
            if (bits > 63)__testlib_fail("random_t::nextBits(int bits): n must be less than 64");
            int lowerBitCount = (random_t::version == 0 ? 31 : 32);
            long long left = (nextBits(31) << 32);
            long long right = nextBits(lowerBitCount);
            return left ^ right;
        }
    }

public:
    static int version;
    random_t() : seed(3905348978240129619LL) {}
    void setSeed(int argc, char* argv[]) {
        random_t p;
        seed = 3905348978240129619LL;
        for (int i = 1; i < argc; i++) {
            std::size_t le = std::strlen(argv[i]);
            for (std::size_t j = 0; j < le; j++)seed = seed * multiplier + (unsigned int)(argv[i][j]) + addend;
            seed += multiplier / addend;
        }
        seed = seed & mask;
    }
    void setSeed(long long _seed) {
        _seed = (_seed ^ multiplier) & mask;
        seed = _seed;
    }
#ifndef __BORLANDC__
    std::string next(const std::string& ptrn) {
        pattern p(ptrn);
        return p.next(*this);
    }
#else

    std::string next(std::string ptrn) {
        pattern p(ptrn);
        return p.next(*this);
    }
#endif
    int next(int n) {
        if (n <= 0)__testlib_fail("random_t::next(int n): n must be positive");
        if ((n & -n) == n)return (int)((n * (long long)nextBits(31)) >> 31);
        const long long limit = INT_MAX / n * n;
        long long bits;
        do {
            bits = nextBits(31);
        } while (bits >= limit);
        return int(bits % n);
    }
    unsigned int next(unsigned int n) {
        if (n >= INT_MAX)__testlib_fail("random_t::next(unsigned int n): n must be less INT_MAX");
        return (unsigned int)next(int(n));
    }
    long long next(long long n) {
        if (n <= 0)__testlib_fail("random_t::next(long long n): n must be positive");
        const long long limit = __TESTLIB_LONGLONG_MAX / n * n;
        long long bits;
        do {
            bits = nextBits(63);
        } while (bits >= limit);
        return bits % n;
    }
    unsigned long long next(unsigned long long n) {
        if (n >= (unsigned long long)(__TESTLIB_LONGLONG_MAX))__testlib_fail("random_t::next(unsigned long long n): n must be less LONGLONG_MAX");
        return (unsigned long long)next((long long)(n));
    }
    long next(long n) {
        return (long)next((long long)(n));
    }
    unsigned long next(unsigned long n) {
        if (n >= (unsigned long)(LONG_MAX))__testlib_fail("random_t::next(unsigned long n): n must be less LONG_MAX");
        return (unsigned long)next((unsigned long long)(n));
    }
    int next(int from, int to) {
        return int(next((long long)to - from + 1) + from);
    }
    unsigned int next(unsigned int from, unsigned int to) {
        return (unsigned int)(next((long long)to - from + 1) + from);
    }
    long long next(long long from, long long to) {
        return next(to - from + 1) + from;
    }
    unsigned long long next(unsigned long long from, unsigned long long to) {
        if (from > to)__testlib_fail("random_t::next(unsigned long long from, unsigned long long to): from can't not exceed to");
        return next(to - from + 1) + from;
    }
    long next(long from, long to) {
        return next(to - from + 1) + from;
    }
    unsigned long next(unsigned long from, unsigned long to) {
        if (from > to)__testlib_fail("random_t::next(unsigned long from, unsigned long to): from can't not exceed to");
        return next(to - from + 1) + from;
    }
    double next() {
        long long left = ((long long)(nextBits(26)) << 27);
        long long right = nextBits(27);
        return (double)(left + right) / (double)(1LL << 53);
    }
    double next(double n) {
        return n * next();
    }
    double next(double from, double to) {
        if (from > to)__testlib_fail("random_t::next(double from, double to): from can't not exceed to");
        return next(to - from) + from;
    }
    template <typename Container>
    typename Container::value_type any(const Container& c) {
        size_t size = c.size();
        if (size <= 0)__testlib_fail("random_t::any(const Container& c): c.size() must be positive");
        return *(c.begin() + next(size));
    }
    template <typename Iter>
    typename Iter::value_type any(const Iter& begin, const Iter& end) {
        int size = int(end - begin);
        if (size <= 0)__testlib_fail("random_t::any(const Iter& begin, const Iter& end): range must have positive length");
        return *(begin + next(size));
    }
#ifdef __GNUC__
    __attribute__((format(printf, 2, 3)))
#endif
        std::string
        next(const char* format, ...) {
        FMT_TO_RESULT(format, format, ptrn);
        return next(ptrn);
    }
    int wnext(int n, int type) {
        if (n <= 0)__testlib_fail("random_t::wnext(int n, int type): n must be positive");
        if (abs(type) < random_t::lim) {
            int result = next(n);
            for (int i = 0; i < +type; i++)result = __testlib_max(result, next(n));
            for (int i = 0; i < -type; i++)result = __testlib_min(result, next(n));
            return result;
        } else {
            double p;
            if (type > 0)p = std::pow(next() + 0.0, 1.0 / (type + 1));
            else p = 1 - std::pow(next() + 0.0, 1.0 / (-type + 1));
            return int(n * p);
        }
    }
    long long wnext(long long n, int type) {
        if (n <= 0)__testlib_fail("random_t::wnext(long long n, int type): n must be positive");
        if (abs(type) < random_t::lim) {
            long long result = next(n);
            for (int i = 0; i < +type; i++)result = __testlib_max(result, next(n));
            for (int i = 0; i < -type; i++)result = __testlib_min(result, next(n));
            return result;
        } else {
            double p;
            if (type > 0)p = std::pow(next() + 0.0, 1.0 / (type + 1));
            else p = std::pow(next() + 0.0, -type + 1);
            return __testlib_min(__testlib_max((long long)(double(n) * p), 0LL), n - 1LL);
        }
    }
    double wnext(int type) {
        if (abs(type) < random_t::lim) {
            double result = next();
            for (int i = 0; i < +type; i++)result = __testlib_max(result, next());
            for (int i = 0; i < -type; i++)result = __testlib_min(result, next());
            return result;
        } else {
            double p;
            if (type > 0)p = std::pow(next() + 0.0, 1.0 / (type + 1));
            else p = std::pow(next() + 0.0, -type + 1);
            return p;
        }
    }
    double wnext(double n, int type) {
        if (n <= 0)__testlib_fail("random_t::wnext(double n, int type): n must be positive");
        if (abs(type) < random_t::lim) {
            double result = next();
            for (int i = 0; i < +type; i++)result = __testlib_max(result, next());
            for (int i = 0; i < -type; i++)result = __testlib_min(result, next());
            return n * result;
        } else {
            double p;
            if (type > 0)p = std::pow(next() + 0.0, 1.0 / (type + 1));
            else p = std::pow(next() + 0.0, -type + 1);
            return n * p;
        }
    }
    unsigned int wnext(unsigned int n, int type) {
        if (n >= INT_MAX)__testlib_fail("random_t::wnext(unsigned int n, int type): n must be less INT_MAX");
        return (unsigned int)wnext(int(n), type);
    }
    unsigned long long wnext(unsigned long long n, int type) {
        if (n >= (unsigned long long)(__TESTLIB_LONGLONG_MAX))__testlib_fail("random_t::wnext(unsigned long long n, int type): n must be less LONGLONG_MAX");
        return (unsigned long long)wnext((long long)(n), type);
    }
    long wnext(long n, int type) {
        return (long)wnext((long long)(n), type);
    }
    unsigned long wnext(unsigned long n, int type) {
        if (n >= (unsigned long)(LONG_MAX))__testlib_fail("random_t::wnext(unsigned long n, int type): n must be less LONG_MAX");
        return (unsigned long)wnext((unsigned long long)(n), type);
    }
    int wnext(int from, int to, int type) {
        if (from > to)__testlib_fail("random_t::wnext(int from, int to, int type): from can't not exceed to");
        return wnext(to - from + 1, type) + from;
    }
    int wnext(unsigned int from, unsigned int to, int type) {
        if (from > to)__testlib_fail("random_t::wnext(unsigned int from, unsigned int to, int type): from can't not exceed to");
        return int(wnext(to - from + 1, type) + from);
    }
    long long wnext(long long from, long long to, int type) {
        if (from > to)__testlib_fail("random_t::wnext(long long from, long long to, int type): from can't not exceed to");
        return wnext(to - from + 1, type) + from;
    }
    unsigned long long wnext(unsigned long long from, unsigned long long to, int type) {
        if (from > to)__testlib_fail("random_t::wnext(unsigned long long from, unsigned long long to, int type): from can't not exceed to");
        return wnext(to - from + 1, type) + from;
    }
    long wnext(long from, long to, int type) {
        if (from > to)__testlib_fail("random_t::wnext(long from, long to, int type): from can't not exceed to");
        return wnext(to - from + 1, type) + from;
    }
    unsigned long wnext(unsigned long from, unsigned long to, int type) {
        if (from > to)__testlib_fail("random_t::wnext(unsigned long from, unsigned long to, int type): from can't not exceed to");
        return wnext(to - from + 1, type) + from;
    }
    double wnext(double from, double to, int type) {
        if (from > to)__testlib_fail("random_t::wnext(double from, double to, int type): from can't not exceed to");
        return wnext(to - from, type) + from;
    }
    template <typename Container>
    typename Container::value_type wany(const Container& c, int type) {
        size_t size = c.size();
        if (size <= 0)__testlib_fail("random_t::wany(const Container& c, int type): c.size() must be positive");
        return *(c.begin() + wnext(size, type));
    }
    template <typename Iter>
    typename Iter::value_type wany(const Iter& begin, const Iter& end, int type) {
        int size = int(end - begin);
        if (size <= 0)__testlib_fail("random_t::any(const Iter& begin, const Iter& end, int type): range must have positive length");
        return *(begin + wnext(size, type));
    }
    template <typename T, typename E>
    std::vector<E> perm(T size, E first) {
        if (size <= 0)__testlib_fail("random_t::perm(T size, E first = 0): size must be positive");
        std::vector<E> p(size);
        for (T i = 0; i < size; i++)p[i] = first + i;
        if (size > 1)for (T i = 1; i < size; i++)std::swap(p[i], p[next(i + 1)]);
        return p;
    }
    template <typename T>
    std::vector<T> perm(T size) {
        return perm(size, T(0));
    }
};
const int random_t::lim = 25;
const unsigned long long random_t::multiplier = 0x5DEECE66DLL;
const unsigned long long random_t::addend = 0xBLL;
const unsigned long long random_t::mask = (1LL << 48) - 1;
int random_t::version = -1;

bool pattern::matches(const std::string& s) const {
    return matches(s, 0);
}
static bool __pattern_isSlash(const std::string& s, size_t pos) {
    return s[pos] == '\\';
}
#ifdef __GNUC__
__attribute__((pure))
#endif
static bool
__pattern_isCommandChar(const std::string& s, size_t pos, char value) {
    if (pos >= s.length())return false;
    int slashes = 0;
    int before = int(pos) - 1;
    while (before >= 0 && s[before] == '\\')before--, slashes++;
    return slashes % 2 == 0 && s[pos] == value;
}
static char __pattern_getChar(const std::string& s, size_t& pos) {
    if (__pattern_isSlash(s, pos))pos += 2;
    else pos++;
    return s[pos - 1];
}
#ifdef __GNUC__
__attribute__((pure))
#endif
static int
__pattern_greedyMatch(const std::string& s, size_t pos, const std::vector<char> chars) {
    int result = 0;
    while (pos < s.length()) {
        char c = s[pos++];
        if (!std::binary_search(chars.begin(), chars.end(), c))break;
        else result++;
    }
    return result;
}
std::string pattern::src() const {
    return s;
}
bool pattern::matches(const std::string& s, size_t pos) const {
    std::string result;
    if (to > 0) {
        int size = __pattern_greedyMatch(s, pos, chars);
        if (size < from)return false;
        if (size > to)size = to;
        pos += size;
    }
    if (children.size() > 0) {
        for (size_t child = 0; child < children.size(); child++)if (children[child].matches(s, pos))return true;
        return false;
    } else return pos == s.length();
}
std::string pattern::next(random_t& rnd) const {
    std::string result;
    result.reserve(20);
    if (to == INT_MAX)__testlib_fail("pattern::next(random_t& rnd): can't process character '*' for generation");
    if (to > 0) {
        int count = rnd.next(to - from + 1) + from;
        for (int i = 0; i < count; i++)result += chars[rnd.next(int(chars.size()))];
    }
    if (children.size() > 0) {
        int child = rnd.next(int(children.size()));
        result += children[child].next(rnd);
    }
    return result;
}
static void __pattern_scanCounts(const std::string& s, size_t& pos, int& from, int& to) {
    if (pos >= s.length()) {
        from = to = 1;
        return;
    }
    if (__pattern_isCommandChar(s, pos, '{')) {
        std::vector<std::string> parts;
        std::string part;
        pos++;
        while (pos < s.length() && !__pattern_isCommandChar(s, pos, '}')) {
            if (__pattern_isCommandChar(s, pos, ','))parts.push_back(part), part = "", pos++;
            else part += __pattern_getChar(s, pos);
        }
        if (part != "")parts.push_back(part);
        if (!__pattern_isCommandChar(s, pos, '}'))__testlib_fail("pattern: Illegal pattern (or part) \"" + s + "\"");
        pos++;
        if (parts.size() < 1 || parts.size() > 2)__testlib_fail("pattern: Illegal pattern (or part) \"" + s + "\"");
        std::vector<int> numbers;
        for (size_t i = 0; i < parts.size(); i++) {
            if (parts[i].length() == 0)__testlib_fail("pattern: Illegal pattern (or part) \"" + s + "\"");
            int number;
            if (std::sscanf(parts[i].c_str(), "%d", &number) != 1)__testlib_fail("pattern: Illegal pattern (or part) \"" + s + "\"");
            numbers.push_back(number);
        }
        if (numbers.size() == 1)from = to = numbers[0];
        else from = numbers[0], to = numbers[1];
        if (from > to)__testlib_fail("pattern: Illegal pattern (or part) \"" + s + "\"");
    } else {
        if (__pattern_isCommandChar(s, pos, '?')) {
            from = 0, to = 1, pos++;
            return;
        }
        if (__pattern_isCommandChar(s, pos, '*')) {
            from = 0, to = INT_MAX, pos++;
            return;
        }
        if (__pattern_isCommandChar(s, pos, '+')) {
            from = 1, to = INT_MAX, pos++;
            return;
        }
        from = to = 1;
    }
}
static std::vector<char> __pattern_scanCharSet(const std::string& s, size_t& pos) {
    if (pos >= s.length())__testlib_fail("pattern: Illegal pattern (or part) \"" + s + "\"");
    std::vector<char> result;
    if (__pattern_isCommandChar(s, pos, '[')) {
        pos++;
        bool negative = __pattern_isCommandChar(s, pos, '^');
        char prev = 0;
        while (pos < s.length() && !__pattern_isCommandChar(s, pos, ']')) {
            if (__pattern_isCommandChar(s, pos, '-') && prev != 0) {
                pos++;
                if (pos + 1 == s.length() || __pattern_isCommandChar(s, pos, ']')) {
                    result.push_back(prev);
                    prev = '-';
                    continue;
                }
                char next = __pattern_getChar(s, pos);
                if (prev > next)__testlib_fail("pattern: Illegal pattern (or part) \"" + s + "\"");
                for (char c = prev; c != next; c++)result.push_back(c);
                result.push_back(next);
                prev = 0;
            } else {
                if (prev != 0)result.push_back(prev);
                prev = __pattern_getChar(s, pos);
            }
        }
        if (prev != 0)result.push_back(prev);
        if (!__pattern_isCommandChar(s, pos, ']'))__testlib_fail("pattern: Illegal pattern (or part) \"" + s + "\"");
        pos++;
        if (negative) {
            std::sort(result.begin(), result.end());
            std::vector<char> actuals;
            for (int code = 0; code < 255; code++) {
                char c = char(code);
                if (!std::binary_search(result.begin(), result.end(), c))actuals.push_back(c);
            }
            result = actuals;
        }
        std::sort(result.begin(), result.end());
    } else result.push_back(__pattern_getChar(s, pos));
    return result;
}
pattern::pattern(std::string s) : s(s), from(0), to(0) {
    std::string t;
    for (size_t i = 0; i < s.length(); i++)if (!__pattern_isCommandChar(s, i, ' '))t += s[i];
    s = t;
    int opened = 0;
    int firstClose = -1;
    std::vector<int> seps;
    for (size_t i = 0; i < s.length(); i++) {
        if (__pattern_isCommandChar(s, i, '(')) {
            opened++;
            continue;
        }
        if (__pattern_isCommandChar(s, i, ')')) {
            opened--;
            if (opened == 0 && firstClose == -1)firstClose = int(i);
            continue;
        }
        if (opened < 0)__testlib_fail("pattern: Illegal pattern (or part) \"" + s + "\"");
        if (__pattern_isCommandChar(s, i, '|') && opened == 0)seps.push_back(int(i));
    }
    if (opened != 0)__testlib_fail("pattern: Illegal pattern (or part) \"" + s + "\"");
    if (seps.size() == 0 && firstClose + 1 == (int)s.length() && __pattern_isCommandChar(s, 0, '(') && __pattern_isCommandChar(s, s.length() - 1, ')')) {
        children.push_back(pattern(s.substr(1, s.length() - 2)));
    } else {
        if (seps.size() > 0) {
            seps.push_back(int(s.length()));
            int last = 0;
            for (size_t i = 0; i < seps.size(); i++) {
                children.push_back(pattern(s.substr(last, seps[i] - last)));
                last = seps[i] + 1;
            }
        } else {
            size_t pos = 0;
            chars = __pattern_scanCharSet(s, pos);
            __pattern_scanCounts(s, pos, from, to);
            if (pos < s.length())children.push_back(pattern(s.substr(pos)));
        }
    }
}

template <typename C>
inline bool isEof(C c) {
    return c == EOFC;
}
template <typename C>
inline bool isEoln(C c) {
    return (c == LF || c == CR);
}
template <typename C>
inline bool isBlanks(C c) {
    return (c == LF || c == CR || c == SPACE || c == TAB);
}
inline std::string trim(const std::string& s) {
    if (s.empty())return s;
    int left = 0;
    while (left < int(s.length()) && isBlanks(s[left]))left++;
    if (left >= int(s.length()))return "";
    int right = int(s.length()) - 1;
    while (right >= 0 && isBlanks(s[right]))right--;
    if (right < 0)return "";
    return s.substr(left, right - left + 1);
}
enum TMode {
    _input,
    _output,
    _answer
};

enum TResult {
    _ok = 0,
    _wa = 1,
    _pe = 2,
    _fail = 3,
    _dirt = 4,
    _points = 5,
    _unexpected_eof = 8,
    _partially = 16
};
enum TTestlibMode {
    _unknown,
    _checker,
    _validator,
    _generator,
    _interactor
};
#define _pc(exitCode) (TResult(_partially + (exitCode)))

const std::string outcomes[] = {
    "accepted",
    "wrong-answer",
    "presentation-error",
    "fail",
    "fail",
#ifndef PCMS2
    "points",
#else
    "relative-scoring",
#endif
    "reserved",
    "reserved",
    "unexpected-eof",
    "reserved",
    "reserved",
    "reserved",
    "reserved",
    "reserved",
    "reserved",
    "reserved",
    "partially-correct"
};
class InputStreamReader {
public:
    virtual int curChar() = 0;
    virtual int nextChar() = 0;
    virtual void skipChar() = 0;
    virtual void unreadChar(int c) = 0;
    virtual std::string getName() = 0;
    virtual bool eof() = 0;
    virtual void close() = 0;
    virtual int getLine() = 0;
    virtual ~InputStreamReader() = 0;
};
InputStreamReader::~InputStreamReader() {}
class StringInputStreamReader : public InputStreamReader {
private:
    std::string s;
    size_t pos;

public:
    StringInputStreamReader(const std::string& content) : s(content), pos(0) {}
    int curChar() {
        if (pos >= s.length())return EOFC;
        else return s[pos];
    }
    int nextChar() {
        if (pos >= s.length()) {
            pos++;
            return EOFC;
        } else return s[pos++];
    }
    void skipChar() {
        pos++;
    }
    void unreadChar(int c) {
        if (pos == 0)__testlib_fail("FileFileInputStreamReader::unreadChar(int): pos == 0.");
        pos--;
        if (pos < s.length())s[pos] = char(c);
    }
    std::string getName() {
        return __testlib_part(s);
    }
    int getLine() {
        return -1;
    }
    bool eof() {
        return pos >= s.length();
    }
    void close() {}
};
class FileInputStreamReader : public InputStreamReader {
private:
    std::FILE* file;
    std::string name;
    int line;
    std::vector<int> undoChars;
    inline int postprocessGetc(int getcResult) {
        if (getcResult != EOF)return getcResult;
        else return EOFC;
    }
    int getc(FILE* file) {
        int c;
        if (undoChars.empty())c = ::getc(file);
        else {
            c = undoChars.back();
            undoChars.pop_back();
        }
        if (c == LF)line++;
        return c;
    }
    int ungetc(int c) {
        if (c == LF)line--;
        undoChars.push_back(c);
        return c;
    }

public:
    FileInputStreamReader(std::FILE* file, const std::string& name) : file(file), name(name), line(1) {}
    int curChar() {
        if (feof(file))return EOFC;
        else {
            int c = getc(file);
            ungetc(c);
            return postprocessGetc(c);
        }
    }
    int nextChar() {
        if (feof(file))return EOFC;
        else return postprocessGetc(getc(file));
    }
    void skipChar() {
        getc(file);
    }
    void unreadChar(int c) {
        ungetc(c);
    }
    std::string getName() {
        return name;
    }
    int getLine() {
        return line;
    }
    bool eof() {
        if (NULL == file || feof(file))return true;
        else {
            int c = nextChar();
            if (c == EOFC || (c == EOF && feof(file)))return true;
            unreadChar(c);
            return false;
        }
    }
    void close() {
        if (NULL != file) {
            fclose(file);
            file = NULL;
        }
    }
};
class BufferedFileInputStreamReader : public InputStreamReader {
private:
    static const size_t BUFFER_SIZE;
    static const size_t MAX_UNREAD_COUNT;
    std::FILE* file;
    char* buffer;
    bool* isEof;
    int bufferPos;
    size_t bufferSize;
    std::string name;
    int line;
    bool refill() {
        if (NULL == file)__testlib_fail("BufferedFileInputStreamReader: file == NULL (" + getName() + ")");
        if (bufferPos >= int(bufferSize)) {
            size_t readSize = fread(
                buffer + MAX_UNREAD_COUNT,
                1,
                BUFFER_SIZE - MAX_UNREAD_COUNT,
                file);
            if (readSize < BUFFER_SIZE - MAX_UNREAD_COUNT
                && ferror(file))__testlib_fail("BufferedFileInputStreamReader: unable to read (" + getName() + ")");
            bufferSize = MAX_UNREAD_COUNT + readSize;
            bufferPos = int(MAX_UNREAD_COUNT);
            std::memset(isEof + MAX_UNREAD_COUNT, 0, sizeof(isEof[0]) * readSize);
            return readSize > 0;
        } else return true;
    }
    char increment() {
        char c;
        if ((c = buffer[bufferPos++]) == LF)line++;
        return c;
    }
public:
    BufferedFileInputStreamReader(std::FILE* file, const std::string& name) : file(file), name(name), line(1) {
        buffer = new char[BUFFER_SIZE];
        isEof = new bool[BUFFER_SIZE];
        bufferSize = MAX_UNREAD_COUNT;
        bufferPos = int(MAX_UNREAD_COUNT);
    }
    ~BufferedFileInputStreamReader() {
        if (NULL != buffer) {
            delete[] buffer;
            buffer = NULL;
        }
        if (NULL != isEof) {
            delete[] isEof;
            isEof = NULL;
        }
    }
    int curChar() {
        if (!refill())return EOFC;
        return isEof[bufferPos] ? EOFC : buffer[bufferPos];
    }
    int nextChar() {
        if (!refill())return EOFC;
        return isEof[bufferPos] ? EOFC : increment();
    }
    void skipChar() {
        increment();
    }
    void unreadChar(int c) {
        bufferPos--;
        if (bufferPos < 0)__testlib_fail("BufferedFileInputStreamReader::unreadChar(int): bufferPos < 0");
        isEof[bufferPos] = (c == EOFC);
        buffer[bufferPos] = char(c);
        if (c == LF)line--;
    }
    std::string getName() {
        return name;
    }
    int getLine() {
        return line;
    }
    bool eof() {
        return !refill() || EOFC == curChar();
    }
    void close() {
        if (NULL != file) {
            fclose(file);
            file = NULL;
        }
    }
};
const size_t BufferedFileInputStreamReader::BUFFER_SIZE = 2000000;
const size_t BufferedFileInputStreamReader::MAX_UNREAD_COUNT = BufferedFileInputStreamReader::BUFFER_SIZE / 2;
struct InStream {
    InStream();
    ~InStream();
    InStream(const InStream& baseStream, std::string content);
    InputStreamReader* reader;
    int lastLine;
    std::string name;
    TMode mode;
    bool opened;
    bool stdfile;
    bool strict;
    int wordReserveSize;
    std::string _tmpReadToken;
    int readManyIteration;
    size_t maxFileSize;
    size_t maxTokenLength;
    size_t maxMessageLength;
    void init(std::string fileName, TMode mode);
    void init(std::FILE* f, TMode mode);
    void skipBlanks();
    char curChar();
    void skipChar();
    char nextChar();
    char readChar();
    char readChar(char c);
    char readSpace();
    void unreadChar(char c);
    void reset(std::FILE* file = NULL);
    bool eof();
    bool seekEof();
    bool eoln();
    bool seekEoln();
    void nextLine();
    std::string readWord();
    std::string readToken();
    std::string readWord(const std::string& ptrn, const std::string& variableName = "");
    std::string readWord(const pattern& p, const std::string& variableName = "");
    std::vector<std::string> readWords(int size, const std::string& ptrn, const std::string& variablesName = "", int indexBase = 1);
    std::vector<std::string> readWords(int size, const pattern& p, const std::string& variablesName = "", int indexBase = 1);
    std::vector<std::string> readWords(int size, int indexBase = 1);
    std::string readToken(const std::string& ptrn, const std::string& variableName = "");
    std::string readToken(const pattern& p, const std::string& variableName = "");
    std::vector<std::string> readTokens(int size, const std::string& ptrn, const std::string& variablesName = "", int indexBase = 1);
    std::vector<std::string> readTokens(int size, const pattern& p, const std::string& variablesName = "", int indexBase = 1);
    std::vector<std::string> readTokens(int size, int indexBase = 1);
    void readWordTo(std::string& result);
    void readWordTo(std::string& result, const pattern& p, const std::string& variableName = "");
    void readWordTo(std::string& result, const std::string& ptrn, const std::string& variableName = "");
    void readTokenTo(std::string& result);
    void readTokenTo(std::string& result, const pattern& p, const std::string& variableName = "");
    void readTokenTo(std::string& result, const std::string& ptrn, const std::string& variableName = "");
    long long readLong();
    unsigned long long readUnsignedLong();
    int readInteger();
    int readInt();
    long long readLong(long long minv, long long maxv, const std::string& variableName = "");
    std::vector<long long> readLongs(int size, long long minv, long long maxv, const std::string& variablesName = "", int indexBase = 1);
    std::vector<long long> readLongs(int size, int indexBase = 1);
    unsigned long long readUnsignedLong(unsigned long long minv, unsigned long long maxv, const std::string& variableName = "");
    std::vector<unsigned long long> readUnsignedLongs(int size, unsigned long long minv, unsigned long long maxv, const std::string& variablesName = "", int indexBase = 1);
    std::vector<unsigned long long> readUnsignedLongs(int size, int indexBase = 1);
    unsigned long long readLong(unsigned long long minv, unsigned long long maxv, const std::string& variableName = "");
    std::vector<unsigned long long> readLongs(int size, unsigned long long minv, unsigned long long maxv, const std::string& variablesName = "", int indexBase = 1);
    int readInteger(int minv, int maxv, const std::string& variableName = "");
    int readInt(int minv, int maxv, const std::string& variableName = "");
    std::vector<int> readIntegers(int size, int minv, int maxv, const std::string& variablesName = "", int indexBase = 1);
    std::vector<int> readIntegers(int size, int indexBase = 1);
    std::vector<int> readInts(int size, int minv, int maxv, const std::string& variablesName = "", int indexBase = 1);
    std::vector<int> readInts(int size, int indexBase = 1);
    double readReal();
    double readDouble();
    double readReal(double minv, double maxv, const std::string& variableName = "");
    std::vector<double> readReals(int size, double minv, double maxv, const std::string& variablesName = "", int indexBase = 1);
    std::vector<double> readReals(int size, int indexBase = 1);
    double readDouble(double minv, double maxv, const std::string& variableName = "");
    std::vector<double> readDoubles(int size, double minv, double maxv, const std::string& variablesName = "", int indexBase = 1);
    std::vector<double> readDoubles(int size, int indexBase = 1);
    double readStrictReal(double minv, double maxv,
        int minAfterPointDigitCount, int maxAfterPointDigitCount,
        const std::string& variableName = "");
    std::vector<double> readStrictReals(int size, double minv, double maxv,
        int minAfterPointDigitCount, int maxAfterPointDigitCount,
        const std::string& variablesName = "", int indexBase = 1);
    double readStrictDouble(double minv, double maxv,
        int minAfterPointDigitCount, int maxAfterPointDigitCount,
        const std::string& variableName = "");
    std::vector<double> readStrictDoubles(int size, double minv, double maxv,
        int minAfterPointDigitCount, int maxAfterPointDigitCount,
        const std::string& variablesName = "", int indexBase = 1);
    std::string readString();
    std::vector<std::string> readStrings(int size, int indexBase = 1);
    void readStringTo(std::string& result);
    std::string readString(const pattern& p, const std::string& variableName = "");
    std::string readString(const std::string& ptrn, const std::string& variableName = "");
    std::vector<std::string> readStrings(int size, const pattern& p, const std::string& variableName = "", int indexBase = 1);
    std::vector<std::string> readStrings(int size, const std::string& ptrn, const std::string& variableName = "", int indexBase = 1);
    void readStringTo(std::string& result, const pattern& p, const std::string& variableName = "");
    void readStringTo(std::string& result, const std::string& ptrn, const std::string& variableName = "");
    std::string readLine();
    std::vector<std::string> readLines(int size, int indexBase = 1);
    void readLineTo(std::string& result);
    std::string readLine(const pattern& p, const std::string& variableName = "");
    std::string readLine(const std::string& ptrn, const std::string& variableName = "");
    std::vector<std::string> readLines(int size, const pattern& p, const std::string& variableName = "", int indexBase = 1);
    std::vector<std::string> readLines(int size, const std::string& ptrn, const std::string& variableName = "", int indexBase = 1);
    void readLineTo(std::string& result, const pattern& p, const std::string& variableName = "");
    void readLineTo(std::string& result, const std::string& ptrn, const std::string& variableName = "");
    void readEoln();
    void readEof();
    NORETURN void quit(TResult result, const char* msg);
    NORETURN void quitf(TResult result, const char* msg, ...);
    void quitif(bool condition, TResult result, const char* msg, ...);
    NORETURN void quits(TResult result, std::string msg);
#ifdef __GNUC__
    __attribute__((format(printf, 3, 4)))
#endif
        void
        ensuref(bool cond, const char* format, ...);
    void __testlib_ensure(bool cond, std::string message);
    void close();
    const static int NO_INDEX = INT_MAX;
    const static char OPEN_BRACKET = char(11);
    const static char CLOSE_BRACKET = char(17);
    const static WORD LightGray = 0x07;
    const static WORD LightRed = 0x0c;
    const static WORD LightCyan = 0x0b;
    const static WORD LightGreen = 0x0a;
    const static WORD LightYellow = 0x0e;
    static void textColor(WORD color);
    static void quitscr(WORD color, const char* msg);
    static void quitscrS(WORD color, std::string msg);
    void xmlSafeWrite(std::FILE* file, const char* msg);

private:
    InStream(const InStream&);
    InStream& operator=(const InStream&);
};
InStream inf;
InStream ouf;
InStream ans;
bool appesMode;
std::string resultName;
std::string checkerName = "untitled checker";
random_t rnd;
TTestlibMode testlibMode = _unknown;
double __testlib_points = std::numeric_limits<float>::infinity();
struct ValidatorBoundsHit {
    static const double EPS;
    bool minHit;
    bool maxHit;
    ValidatorBoundsHit(bool minHit = false, bool maxHit = false) : minHit(minHit), maxHit(maxHit) {};
    ValidatorBoundsHit merge(const ValidatorBoundsHit& validatorBoundsHit) {
        return ValidatorBoundsHit(
            __testlib_max(minHit, validatorBoundsHit.minHit),
            __testlib_max(maxHit, validatorBoundsHit.maxHit));
    }
};
const double ValidatorBoundsHit::EPS = 1E-12;
class Validator {
private:
    std::string _testset;
    std::string _group;
    std::string _testOverviewLogFileName;
    std::map<std::string, ValidatorBoundsHit> _boundsHitByVariableName;
    std::set<std::string> _features;
    std::set<std::string> _hitFeatures;
    bool isVariableNameBoundsAnalyzable(const std::string& variableName) {
        for (size_t i = 0; i < variableName.length(); i++)if ((variableName[i] >= '0' && variableName[i] <= '9') || variableName[i] < ' ')return false;
        return true;
    }
    bool isFeatureNameAnalyzable(const std::string& featureName) {
        for (size_t i = 0; i < featureName.length(); i++)if (featureName[i] < ' ')return false;
        return true;
    }

public:
    Validator() : _testset("tests"), _group() {}
    std::string testset() const {
        return _testset;
    }
    std::string group() const {
        return _group;
    }
    std::string testOverviewLogFileName() const {
        return _testOverviewLogFileName;
    }
    void setTestset(const char* const testset) {
        _testset = testset;
    }
    void setGroup(const char* const group) {
        _group = group;
    }
    void setTestOverviewLogFileName(const char* const testOverviewLogFileName) {
        _testOverviewLogFileName = testOverviewLogFileName;
    }
    void addBoundsHit(const std::string& variableName, ValidatorBoundsHit boundsHit) {
        if (isVariableNameBoundsAnalyzable(variableName)) {
            _boundsHitByVariableName[variableName]
                = boundsHit.merge(_boundsHitByVariableName[variableName]);
        }
    }
    std::string getBoundsHitLog() {
        std::string result;
        for (std::map<std::string, ValidatorBoundsHit>::iterator i = _boundsHitByVariableName.begin();
            i != _boundsHitByVariableName.end();
            i++) {
            result += "\"" + i->first + "\":";
            if (i->second.minHit)result += " min-value-hit";
            if (i->second.maxHit)result += " max-value-hit";
            result += "\n";
        }
        return result;
    }
    std::string getFeaturesLog() {
        std::string result;
        for (std::set<std::string>::iterator i = _features.begin();
            i != _features.end();
            i++) {
            result += "feature \"" + *i + "\":";
            if (_hitFeatures.count(*i))result += " hit";
            result += "\n";
        }
        return result;
    }
    void writeTestOverviewLog() {
        if (!_testOverviewLogFileName.empty()) {
            std::string fileName(_testOverviewLogFileName);
            _testOverviewLogFileName = "";
            FILE* testOverviewLogFile = fopen(fileName.c_str(), "w");
            if (NULL == testOverviewLogFile)__testlib_fail("Validator::writeTestOverviewLog: can't test overview log to (" + fileName + ")");
            fprintf(testOverviewLogFile, "%s%s", getBoundsHitLog().c_str(), getFeaturesLog().c_str());
            if (fclose(testOverviewLogFile))__testlib_fail("Validator::writeTestOverviewLog: can't close test overview log file (" + fileName + ")");
        }
    }
    void addFeature(const std::string& feature) {
        if (_features.count(feature))__testlib_fail("Feature " + feature + " registered twice.");
        if (!isFeatureNameAnalyzable(feature))__testlib_fail("Feature name '" + feature + "' contains restricted characters.");
        _features.insert(feature);
    }
    void feature(const std::string& feature) {
        if (!isFeatureNameAnalyzable(feature))__testlib_fail("Feature name '" + feature + "' contains restricted characters.");
        if (!_features.count(feature))__testlib_fail("Feature " + feature + " didn't registered via addFeature(feature).");
        _hitFeatures.insert(feature);
    }
} validator;
struct TestlibFinalizeGuard {
    static bool alive;
    int quitCount, readEofCount;
    TestlibFinalizeGuard() : quitCount(0), readEofCount(0) {}
    ~TestlibFinalizeGuard() {
        bool _alive = alive;
        alive = false;
        if (_alive) {
            if (testlibMode == _checker && quitCount == 0)__testlib_fail("Checker must end with quit or quitf call.");
            if (testlibMode == _validator && readEofCount == 0 && quitCount == 0)__testlib_fail("Validator must end with readEof call.");
        }
        validator.writeTestOverviewLog();
    }
};
bool TestlibFinalizeGuard::alive = true;
TestlibFinalizeGuard testlibFinalizeGuard;
void disableFinalizeGuard() {
    TestlibFinalizeGuard::alive = false;
}
std::fstream tout;
#if __cplusplus > 199711L || defined(_MSC_VER)
template <typename T>
static std::string vtos(const T& t, std::true_type) {
    if (t == 0)return "0";
    else {
        T n(t);
        bool negative = n < 0;
        std::string s;
        while (n != 0) {
            T digit = n % 10;
            if (digit < 0)digit = -digit;
            s += char('0' + digit);
            n /= 10;
        }
        std::reverse(s.begin(), s.end());
        return negative ? "-" + s : s;
    }
}
template <typename T>
static std::string vtos(const T& t, std::false_type) {
    std::string s;
    static std::stringstream ss;
    ss.str(std::string());
    ss.clear();
    ss << t;
    ss >> s;
    return s;
}
template <typename T>
static std::string vtos(const T& t) {
    return vtos(t, std::is_integral<T>());
}
#else
template <typename T>
static std::string vtos(const T& t) {
    std::string s;
    static std::stringstream ss;
    ss.str(std::string());
    ss.clear();
    ss << t;
    ss >> s;
    return s;
}
#endif
template <typename T>
static std::string toString(const T& t) {
    return vtos(t);
}
InStream::InStream() {
    reader = NULL;
    lastLine = -1;
    name = "";
    mode = _input;
    strict = false;
    stdfile = false;
    wordReserveSize = 4;
    readManyIteration = NO_INDEX;
    maxFileSize = 128 * 1024 * 1024;
    maxTokenLength = 32 * 1024 * 1024;
    maxMessageLength = 32000;
}
InStream::InStream(const InStream& baseStream, std::string content) {
    reader = new StringInputStreamReader(content);
    lastLine = -1;
    opened = true;
    strict = baseStream.strict;
    mode = baseStream.mode;
    name = "based on " + baseStream.name;
    readManyIteration = NO_INDEX;
    maxFileSize = 128 * 1024 * 1024;
    maxTokenLength = 32 * 1024 * 1024;
    maxMessageLength = 32000;
}
InStream::~InStream() {
    if (NULL != reader) {
        reader->close();
        delete reader;
        reader = NULL;
    }
}
#ifdef __GNUC__
__attribute__((const))
#endif
int
resultExitCode(TResult r) {
    if (r == _ok)return OK_EXIT_CODE;
    if (r == _wa)return WA_EXIT_CODE;
    if (r == _pe)return PE_EXIT_CODE;
    if (r == _fail)return FAIL_EXIT_CODE;
    if (r == _dirt)return DIRT_EXIT_CODE;
    if (r == _points)return POINTS_EXIT_CODE;
    if (r == _unexpected_eof)
#ifdef ENABLE_UNEXPECTED_EOF
        return UNEXPECTED_EOF_EXIT_CODE;
#else
        return PE_EXIT_CODE;
#endif
    if (r >= _partially)return PC_BASE_EXIT_CODE + (r - _partially);
    return FAIL_EXIT_CODE;
}
void InStream::textColor(
#if !(defined(ON_WINDOWS) && (!defined(_MSC_VER) || _MSC_VER > 1400)) && defined(__GNUC__)__attribute__((unused))
#endif
    WORD color) {
#if defined(ON_WINDOWS) && (!defined(_MSC_VER) || _MSC_VER > 1400)HANDLE handle = GetStdHandle(STD_OUTPUT_HANDLE);
    SetConsoleTextAttribute(handle, color);
#endif
#if !defined(ON_WINDOWS) && defined(__GNUC__)
    if (isatty(2)) {
        switch (color) {
        case LightRed:
            fprintf(stderr, "\033[1;31m");
            break;
        case LightCyan:
            fprintf(stderr, "\033[1;36m");
            break;
        case LightGreen:
            fprintf(stderr, "\033[1;32m");
            break;
        case LightYellow:
            fprintf(stderr, "\033[1;33m");
            break;
        case LightGray:
        default:
            fprintf(stderr, "\033[0m");
        }
    }
#endif
}
NORETURN void halt(int exitCode) {
#ifdef FOOTER
    InStream::textColor(InStream::LightGray);
    std::fprintf(stderr, "Checker: \"%s\"\n", checkerName.c_str());
    std::fprintf(stderr, "Exit code: %d\n", exitCode);
    InStream::textColor(InStream::LightGray);
#endif
    std::exit(exitCode);
}
static bool __testlib_shouldCheckDirt(TResult result) {
    return result == _ok || result == _points || result >= _partially;
}
static std::string __testlib_appendMessage(const std::string& message, const std::string& extra) {
    int openPos = -1, closePos = -1;
    for (size_t i = 0; i < message.length(); i++) {
        if (message[i] == InStream::OPEN_BRACKET) {
            if (openPos == -1)openPos = i;
            else openPos = INT_MAX;
        }
        if (message[i] == InStream::CLOSE_BRACKET) {
            if (closePos == -1)closePos = i;
            else closePos = INT_MAX;
        }
    }
    if (openPos != -1 && openPos != INT_MAX
        && closePos != -1 && closePos != INT_MAX
        && openPos < closePos) {
        size_t index = message.find(extra, openPos);
        if (index == std::string::npos || int(index) >= closePos) {
            std::string result(message);
            result.insert(closePos, ", " + extra);
            return result;
        }
        return message;
    }
    return message + " " + InStream::OPEN_BRACKET + extra + InStream::CLOSE_BRACKET;
}
static std::string __testlib_toPrintableMessage(const std::string& message) {
    int openPos = -1, closePos = -1;
    for (size_t i = 0; i < message.length(); i++) {
        if (message[i] == InStream::OPEN_BRACKET) {
            if (openPos == -1)openPos = i;
            else openPos = INT_MAX;
        }
        if (message[i] == InStream::CLOSE_BRACKET) {
            if (closePos == -1)closePos = i;
            else closePos = INT_MAX;
        }
    }
    if (openPos != -1 && openPos != INT_MAX
        && closePos != -1 && closePos != INT_MAX
        && openPos < closePos) {
        std::string result(message);
        result[openPos] = '(';
        result[closePos] = ')';
        return result;
    }
    return message;
}
NORETURN void InStream::quit(TResult result, const char* msg) {
    if (TestlibFinalizeGuard::alive)testlibFinalizeGuard.quitCount++;
    std::string message(msg);
    message = trim(message);
    if (__testlib_hasTestCase) {
        if (result != _ok)message = __testlib_appendMessage(message, "test case " + vtos(__testlib_testCase));
        else {
            if (__testlib_testCase == 1)message = __testlib_appendMessage(message, vtos(__testlib_testCase) + " test case");
            else message = __testlib_appendMessage(message, vtos(__testlib_testCase) + " test cases");
        }
    }
    if (message.length() > maxMessageLength) {
        std::string warn = "message length exceeds " + vtos(maxMessageLength) + ", the message is truncated: ";
        message = warn + message.substr(0, maxMessageLength - warn.length());
    }
#ifndef ENABLE_UNEXPECTED_EOF
    if (result == _unexpected_eof)result = _pe;
#endif
    if (mode != _output && result != _fail) {
        if (mode == _input && testlibMode == _validator && lastLine != -1)quits(_fail, __testlib_appendMessage(__testlib_appendMessage(message, name), "line " + vtos(lastLine)));
        else quits(_fail, __testlib_appendMessage(message, name));
    }
    std::FILE* resultFile;
    std::string errorName;
    if (__testlib_shouldCheckDirt(result)) {
        if (testlibMode != _interactor && !ouf.seekEof())quit(_dirt, "Extra information in the output file");
    }
    int pctype = result - _partially;
    bool isPartial = false;
    switch (result) {
    case _ok:
        errorName = "ok ";
        quitscrS(LightGreen, errorName);
        break;
    case _wa:
        errorName = "wrong answer ";
        quitscrS(LightRed, errorName);
        break;
    case _pe:
        errorName = "wrong output format ";
        quitscrS(LightRed, errorName);
        break;
    case _fail:
        errorName = "FAIL ";
        quitscrS(LightRed, errorName);
        break;
    case _dirt:
        errorName = "wrong output format ";
        quitscrS(LightCyan, errorName);
        result = _pe;
        break;
    case _points:
        errorName = "points ";
        quitscrS(LightYellow, errorName);
        break;
    case _unexpected_eof:
        errorName = "unexpected eof ";
        quitscrS(LightCyan, errorName);
        break;
    default:
        if (result >= _partially) {
            errorName = format("partially correct (%d) ", pctype);
            isPartial = true;
            quitscrS(LightYellow, errorName);
        } else quit(_fail, "What is the code ??? ");
    }
    if (resultName != "") {
        resultFile = std::fopen(resultName.c_str(), "w");
        if (resultFile == NULL)quit(_fail, "Can not write to the result file");
        if (appesMode) {
            std::fprintf(resultFile, "<?xml version=\"1.0\" encoding=\"windows-1251\"?>");
            if (isPartial)std::fprintf(resultFile, "<result outcome = \"%s\" pctype = \"%d\">", outcomes[(int)_partially].c_str(), pctype);
            else {
                if (result != _points)std::fprintf(resultFile, "<result outcome = \"%s\">", outcomes[(int)result].c_str());
                else {
                    if (__testlib_points == std::numeric_limits<float>::infinity())quit(_fail, "Expected points, but infinity found");
                    std::string stringPoints = removeDoubleTrailingZeroes(format("%.10f", __testlib_points));
                    std::fprintf(resultFile, "<result outcome = \"%s\" points = \"%s\">", outcomes[(int)result].c_str(), stringPoints.c_str());
                }
            }
            xmlSafeWrite(resultFile, __testlib_toPrintableMessage(message).c_str());
            std::fprintf(resultFile, "</result>\n");
        } else std::fprintf(resultFile, "%s", __testlib_toPrintableMessage(message).c_str());
        if (NULL == resultFile || fclose(resultFile) != 0)quit(_fail, "Can not write to the result file");
    }
    quitscr(LightGray, __testlib_toPrintableMessage(message).c_str());
    std::fprintf(stderr, "\n");
    inf.close();
    ouf.close();
    ans.close();
    if (tout.is_open())tout.close();
    textColor(LightGray);
    if (resultName != "")std::fprintf(stderr, "See file to check exit message\n");
    halt(resultExitCode(result));
}
#ifdef __GNUC__
__attribute__((format(printf, 3, 4)))
#endif
NORETURN void
InStream::quitf(TResult result, const char* msg, ...) {
    FMT_TO_RESULT(msg, msg, message);
    InStream::quit(result, message.c_str());
}
#ifdef __GNUC__
__attribute__((format(printf, 4, 5)))
#endif
void
InStream::quitif(bool condition, TResult result, const char* msg, ...) {
    if (condition) {
        FMT_TO_RESULT(msg, msg, message);
        InStream::quit(result, message.c_str());
    }
}
NORETURN void InStream::quits(TResult result, std::string msg) {
    InStream::quit(result, msg.c_str());
}
void InStream::xmlSafeWrite(std::FILE* file, const char* msg) {
    size_t lmsg = strlen(msg);
    for (size_t i = 0; i < lmsg; i++) {
        if (msg[i] == '&') {
            std::fprintf(file, "%s", "&amp;");
            continue;
        }
        if (msg[i] == '<') {
            std::fprintf(file, "%s", "&lt;");
            continue;
        }
        if (msg[i] == '>') {
            std::fprintf(file, "%s", "&gt;");
            continue;
        }
        if (msg[i] == '"') {
            std::fprintf(file, "%s", "&quot;");
            continue;
        }
        if (0 <= msg[i] && msg[i] <= 31) {
            std::fprintf(file, "%c", '.');
            continue;
        }
        std::fprintf(file, "%c", msg[i]);
    }
}
void InStream::quitscrS(WORD color, std::string msg) {
    quitscr(color, msg.c_str());
}
void InStream::quitscr(WORD color, const char* msg) {
    if (resultName == "") {
        textColor(color);
        std::fprintf(stderr, "%s", msg);
        textColor(LightGray);
    }
}
void InStream::reset(std::FILE* file) {
    if (opened && stdfile)quit(_fail, "Can't reset standard handle");
    if (opened)close();
    if (!stdfile)if (NULL == (file = std::fopen(name.c_str(), "rb"))) {
        if (mode == _output)quits(_pe, std::string("Output file not found: \"") + name + "\"");
        if (mode == _answer)quits(_fail, std::string("Answer file not found: \"") + name + "\"");
    }
    if (NULL != file) {
        opened = true;
        __testlib_set_binary(file);
        if (stdfile)reader = new FileInputStreamReader(file, name);
        else reader = new BufferedFileInputStreamReader(file, name);
    } else {
        opened = false;
        reader = NULL;
    }
}
void InStream::init(std::string fileName, TMode mode) {
    opened = false;
    name = fileName;
    stdfile = false;
    this->mode = mode;
    std::ifstream stream;
    stream.open(fileName.c_str(), std::ios::in);
    if (stream.is_open()) {
        std::streampos start = stream.tellg();
        stream.seekg(0, std::ios::end);
        std::streampos end = stream.tellg();
        size_t fileSize = size_t(end - start);
        stream.close();
        if (fileSize > maxFileSize)quitf(_pe, "File size exceeds %d bytes, size is %d", int(maxFileSize), int(fileSize));
    }
    reset();
}
void InStream::init(std::FILE* f, TMode mode) {
    opened = false;
    name = "untitled";
    this->mode = mode;
    if (f == stdin)name = "stdin", stdfile = true;
    if (f == stdout)name = "stdout", stdfile = true;
    if (f == stderr)name = "stderr", stdfile = true;
    reset(f);
}
char InStream::curChar() {
    return char(reader->curChar());
}
char InStream::nextChar() {
    return char(reader->nextChar());
}
char InStream::readChar() {
    return nextChar();
}
char InStream::readChar(char c) {
    lastLine = reader->getLine();
    char found = readChar();
    if (c != found) {
        if (!isEoln(found))quit(_pe, ("Unexpected character '" + std::string(1, found) + "', but '" + std::string(1, c) + "' expected").c_str());
        else quit(_pe, ("Unexpected character " + ("#" + vtos(int(found))) + ", but '" + std::string(1, c) + "' expected").c_str());
    }
    return found;
}
char InStream::readSpace() {
    return readChar(' ');
}
void InStream::unreadChar(char c) {
    reader->unreadChar(c);
}
void InStream::skipChar() {
    reader->skipChar();
}
void InStream::skipBlanks() {
    while (isBlanks(reader->curChar()))reader->skipChar();
}
std::string InStream::readWord() {
    readWordTo(_tmpReadToken);
    return _tmpReadToken;
}
void InStream::readWordTo(std::string& result) {
    if (!strict)skipBlanks();
    lastLine = reader->getLine();
    int cur = reader->nextChar();
    if (cur == EOFC)quit(_unexpected_eof, "Unexpected end of file - token expected");
    if (isBlanks(cur))quit(_pe, "Unexpected white-space - token expected");
    result.clear();
    while (!(isBlanks(cur) || cur == EOFC)) {
        result += char(cur);
        if (result.length() > maxTokenLength)quitf(_pe, "Length of token exceeds %d, token is '%s...'", int(maxTokenLength), __testlib_part(result).c_str());
        cur = reader->nextChar();
    }
    reader->unreadChar(cur);
    if (result.length() == 0)quit(_unexpected_eof, "Unexpected end of file or white-space - token expected");
}
std::string InStream::readToken() {
    return readWord();
}
void InStream::readTokenTo(std::string& result) {
    readWordTo(result);
}
static std::string __testlib_part(const std::string& s) {
    if (s.length() <= 64)return s;
    else return s.substr(0, 30) + "..." + s.substr(s.length() - 31, 31);
}
#define __testlib_readMany(readMany, readOne, typeName, space)        \
    if (size < 0)                                                     \
        quit(_fail, #readMany ": size should be non-negative.");      \
    if (size > 100000000)                                             \
        quit(_fail, #readMany ": size should be at most 100000000."); \
                                                                      \
    std::vector<typeName> result(size);                               \
    readManyIteration = indexBase;                                    \
                                                                      \
    for (int i = 0; i < size; i++) {                                  \
        result[i] = readOne;                                          \
        readManyIteration++;                                          \
        if (strict && space && i + 1 < size)                          \
            readSpace();                                              \
    }                                                                 \
                                                                      \
    readManyIteration = NO_INDEX;                                     \
    return result;
std::string InStream::readWord(const pattern& p, const std::string& variableName) {
    readWordTo(_tmpReadToken);
    if (!p.matches(_tmpReadToken)) {
        if (readManyIteration == NO_INDEX) {
            if (variableName.empty())quit(_wa, ("Token \"" + __testlib_part(_tmpReadToken) + "\" doesn't correspond to pattern \"" + p.src() + "\"").c_str());
            else quit(_wa, ("Token parameter [name=" + variableName + "] equals to \"" + __testlib_part(_tmpReadToken) + "\", doesn't correspond to pattern \"" + p.src() + "\"").c_str());
        } else {
            if (variableName.empty())quit(_wa, ("Token element [index=" + vtos(readManyIteration) + "] equals to \"" + __testlib_part(_tmpReadToken) + "\" doesn't correspond to pattern \"" + p.src() + "\"").c_str());
            else quit(_wa, ("Token element " + variableName + "[" + vtos(readManyIteration) + "] equals to \"" + __testlib_part(_tmpReadToken) + "\", doesn't correspond to pattern \"" + p.src() + "\"").c_str());
        }
    }
    return _tmpReadToken;
}
std::vector<std::string> InStream::readWords(int size, const pattern& p, const std::string& variablesName, int indexBase) {
    __testlib_readMany(readWords, readWord(p, variablesName), std::string, true);
}
std::vector<std::string> InStream::readWords(int size, int indexBase) {
    __testlib_readMany(readWords, readWord(), std::string, true);
}
std::string InStream::readWord(const std::string& ptrn, const std::string& variableName) {
    return readWord(pattern(ptrn), variableName);
}
std::vector<std::string> InStream::readWords(int size, const std::string& ptrn, const std::string& variablesName, int indexBase) {
    pattern p(ptrn);
    __testlib_readMany(readWords, readWord(p, variablesName), std::string, true);
}
std::string InStream::readToken(const pattern& p, const std::string& variableName) {
    return readWord(p, variableName);
}
std::vector<std::string> InStream::readTokens(int size, const pattern& p, const std::string& variablesName, int indexBase) {
    __testlib_readMany(readTokens, readToken(p, variablesName), std::string, true);
}
std::vector<std::string> InStream::readTokens(int size, int indexBase) {
    __testlib_readMany(readTokens, readToken(), std::string, true);
}
std::string InStream::readToken(const std::string& ptrn, const std::string& variableName) {
    return readWord(ptrn, variableName);
}
std::vector<std::string> InStream::readTokens(int size, const std::string& ptrn, const std::string& variablesName, int indexBase) {
    pattern p(ptrn);
    __testlib_readMany(readTokens, readWord(p, variablesName), std::string, true);
}
void InStream::readWordTo(std::string& result, const pattern& p, const std::string& variableName) {
    readWordTo(result);
    if (!p.matches(result)) {
        if (variableName.empty())quit(_wa, ("Token \"" + __testlib_part(result) + "\" doesn't correspond to pattern \"" + p.src() + "\"").c_str());
        else quit(_wa, ("Token parameter [name=" + variableName + "] equals to \"" + __testlib_part(result) + "\", doesn't correspond to pattern \"" + p.src() + "\"").c_str());
    }
}
void InStream::readWordTo(std::string& result, const std::string& ptrn, const std::string& variableName) {
    return readWordTo(result, pattern(ptrn), variableName);
}
void InStream::readTokenTo(std::string& result, const pattern& p, const std::string& variableName) {
    return readWordTo(result, p, variableName);
}
void InStream::readTokenTo(std::string& result, const std::string& ptrn, const std::string& variableName) {
    return readWordTo(result, ptrn, variableName);
}
#ifdef __GNUC__
__attribute__((pure))
#endif
static inline bool
equals(long long integer, const char* s) {
    if (integer == LLONG_MIN)return strcmp(s, "-9223372036854775808") == 0;
    if (integer == 0LL)return strcmp(s, "0") == 0;
    size_t length = strlen(s);
    if (length == 0)return false;
    if (integer < 0 && s[0] != '-')return false;
    if (integer < 0)s++, length--, integer = -integer;
    if (length == 0)return false;
    while (integer > 0) {
        int digit = int(integer % 10);
        if (s[length - 1] != '0' + digit)return false;
        length--;
        integer /= 10;
    }
    return length == 0;
}
#ifdef __GNUC__
__attribute__((pure))
#endif
static inline bool
equals(unsigned long long integer, const char* s) {
    if (integer == ULLONG_MAX)return strcmp(s, "18446744073709551615") == 0;
    if (integer == 0ULL)return strcmp(s, "0") == 0;
    size_t length = strlen(s);
    if (length == 0)return false;
    while (integer > 0) {
        int digit = int(integer % 10);
        if (s[length - 1] != '0' + digit)return false;
        length--;
        integer /= 10;
    }
    return length == 0;
}
static inline double stringToDouble(InStream& in, const char* buffer) {
    double retval;
    size_t length = strlen(buffer);
    int minusCount = 0;
    int plusCount = 0;
    int decimalPointCount = 0;
    int digitCount = 0;
    int eCount = 0;
    for (size_t i = 0; i < length; i++) {
        if (('0' <= buffer[i] && buffer[i] <= '9') || buffer[i] == '.'
            || buffer[i] == 'e' || buffer[i] == 'E'
            || buffer[i] == '-' || buffer[i] == '+') {
            if ('0' <= buffer[i] && buffer[i] <= '9')digitCount++;
            if (buffer[i] == 'e' || buffer[i] == 'E')eCount++;
            if (buffer[i] == '-')minusCount++;
            if (buffer[i] == '+')plusCount++;
            if (buffer[i] == '.')decimalPointCount++;
        } else in.quit(_pe, ("Expected double, but \"" + __testlib_part(buffer) + "\" found").c_str());
    }
    if (digitCount == 0 || minusCount > 2 || plusCount > 2 || decimalPointCount > 1 || eCount > 1)in.quit(_pe, ("Expected double, but \"" + __testlib_part(buffer) + "\" found").c_str());
    char* suffix = new char[length + 1];
    int scanned = std::sscanf(buffer, "%lf%s", &retval, suffix);
    bool empty = strlen(suffix) == 0;
    delete[] suffix;
    if (scanned == 1 || (scanned == 2 && empty)) {
        if (__testlib_isNaN(retval))in.quit(_pe, ("Expected double, but \"" + __testlib_part(buffer) + "\" found").c_str());
        return retval;
    } else in.quit(_pe, ("Expected double, but \"" + __testlib_part(buffer) + "\" found").c_str());
}
static inline double stringToStrictDouble(InStream& in, const char* buffer, int minAfterPointDigitCount, int maxAfterPointDigitCount) {
    if (minAfterPointDigitCount < 0)in.quit(_fail, "stringToStrictDouble: minAfterPointDigitCount should be non-negative.");
    if (minAfterPointDigitCount > maxAfterPointDigitCount)in.quit(_fail, "stringToStrictDouble: minAfterPointDigitCount should be less or equal to maxAfterPointDigitCount.");
    double retval;
    size_t length = strlen(buffer);
    if (length == 0 || length > 1000)in.quit(_pe, ("Expected strict double, but \"" + __testlib_part(buffer) + "\" found").c_str());
    if (buffer[0] != '-' && (buffer[0] < '0' || buffer[0] > '9'))in.quit(_pe, ("Expected strict double, but \"" + __testlib_part(buffer) + "\" found").c_str());
    int pointPos = -1;
    for (size_t i = 1; i + 1 < length; i++) {
        if (buffer[i] == '.') {
            if (pointPos > -1)in.quit(_pe, ("Expected strict double, but \"" + __testlib_part(buffer) + "\" found").c_str());
            pointPos = int(i);
        }
        if (buffer[i] != '.' && (buffer[i] < '0' || buffer[i] > '9'))in.quit(_pe, ("Expected strict double, but \"" + __testlib_part(buffer) + "\" found").c_str());
    }
    if (buffer[length - 1] < '0' || buffer[length - 1] > '9')in.quit(_pe, ("Expected strict double, but \"" + __testlib_part(buffer) + "\" found").c_str());
    int afterDigitsCount = (pointPos == -1 ? 0 : int(length) - pointPos - 1);
    if (afterDigitsCount < minAfterPointDigitCount || afterDigitsCount > maxAfterPointDigitCount)in.quit(_pe, ("Expected strict double with number of digits after point in range [" + vtos(minAfterPointDigitCount) + "," + vtos(maxAfterPointDigitCount) + "], but \"" + __testlib_part(buffer) + "\" found").c_str());
    int firstDigitPos = -1;
    for (size_t i = 0; i < length; i++)if (buffer[i] >= '0' && buffer[i] <= '9') {
        firstDigitPos = int(i);
        break;
    }
    if (firstDigitPos > 1 || firstDigitPos == -1)in.quit(_pe, ("Expected strict double, but \"" + __testlib_part(buffer) + "\" found").c_str());
    if (buffer[firstDigitPos] == '0' && firstDigitPos + 1 < int(length) && buffer[firstDigitPos + 1] >= '0' && buffer[firstDigitPos + 1] <= '9')in.quit(_pe, ("Expected strict double, but \"" + __testlib_part(buffer) + "\" found").c_str());
    char* suffix = new char[length + 1];
    int scanned = std::sscanf(buffer, "%lf%s", &retval, suffix);
    bool empty = strlen(suffix) == 0;
    delete[] suffix;
    if (scanned == 1 || (scanned == 2 && empty)) {
        if (__testlib_isNaN(retval) || __testlib_isInfinite(retval))in.quit(_pe, ("Expected double, but \"" + __testlib_part(buffer) + "\" found").c_str());
        if (buffer[0] == '-' && retval >= 0)in.quit(_pe, ("Redundant minus in \"" + __testlib_part(buffer) + "\" found").c_str());
        return retval;
    } else in.quit(_pe, ("Expected double, but \"" + __testlib_part(buffer) + "\" found").c_str());
}
static inline long long stringToLongLong(InStream& in, const char* buffer) {
    if (strcmp(buffer, "-9223372036854775808") == 0)return LLONG_MIN;
    bool minus = false;
    size_t length = strlen(buffer);
    if (length > 1 && buffer[0] == '-')minus = true;
    if (length > 20)in.quit(_pe, ("Expected integer, but \"" + __testlib_part(buffer) + "\" found").c_str());
    long long retval = 0LL;
    int zeroes = 0;
    int processingZeroes = true;
    for (int i = (minus ? 1 : 0); i < int(length); i++) {
        if (buffer[i] == '0' && processingZeroes)zeroes++;
        else processingZeroes = false;
        if (buffer[i] < '0' || buffer[i] > '9')in.quit(_pe, ("Expected integer, but \"" + __testlib_part(buffer) + "\" found").c_str());
        retval = retval * 10 + (buffer[i] - '0');
    }
    if (retval < 0)in.quit(_pe, ("Expected integer, but \"" + __testlib_part(buffer) + "\" found").c_str());
    if ((zeroes > 0 && (retval != 0 || minus)) || zeroes > 1)in.quit(_pe, ("Expected integer, but \"" + __testlib_part(buffer) + "\" found").c_str());
    retval = (minus ? -retval : +retval);
    if (length < 19)return retval;
    if (equals(retval, buffer))return retval;
    else in.quit(_pe, ("Expected int64, but \"" + __testlib_part(buffer) + "\" found").c_str());
}
static inline unsigned long long stringToUnsignedLongLong(InStream& in, const char* buffer) {
    size_t length = strlen(buffer);
    if (length > 20)in.quit(_pe, ("Expected unsigned integer, but \"" + __testlib_part(buffer) + "\" found").c_str());
    if (length > 1 && buffer[0] == '0')in.quit(_pe, ("Expected unsigned integer, but \"" + __testlib_part(buffer) + "\" found").c_str());
    unsigned long long retval = 0LL;
    for (int i = 0; i < int(length); i++) {
        if (buffer[i] < '0' || buffer[i] > '9')in.quit(_pe, ("Expected unsigned integer, but \"" + __testlib_part(buffer) + "\" found").c_str());
        retval = retval * 10 + (buffer[i] - '0');
    }
    if (length < 19)return retval;
    if (length == 20 && strcmp(buffer, "18446744073709551615") == 1)in.quit(_pe, ("Expected unsigned int64, but \"" + __testlib_part(buffer) + "\" found").c_str());
    if (equals(retval, buffer))return retval;
    else in.quit(_pe, ("Expected unsigned int64, but \"" + __testlib_part(buffer) + "\" found").c_str());
}
int InStream::readInteger() {
    if (!strict && seekEof())quit(_unexpected_eof, "Unexpected end of file - int32 expected");
    readWordTo(_tmpReadToken);
    long long value = stringToLongLong(*this, _tmpReadToken.c_str());
    if (value < INT_MIN || value > INT_MAX)quit(_pe, ("Expected int32, but \"" + __testlib_part(_tmpReadToken) + "\" found").c_str());
    return int(value);
}
long long InStream::readLong() {
    if (!strict && seekEof())quit(_unexpected_eof, "Unexpected end of file - int64 expected");
    readWordTo(_tmpReadToken);
    return stringToLongLong(*this, _tmpReadToken.c_str());
}
unsigned long long InStream::readUnsignedLong() {
    if (!strict && seekEof())quit(_unexpected_eof, "Unexpected end of file - int64 expected");
    readWordTo(_tmpReadToken);
    return stringToUnsignedLongLong(*this, _tmpReadToken.c_str());
}
long long InStream::readLong(long long minv, long long maxv, const std::string& variableName) {
    long long result = readLong();
    if (result < minv || result > maxv) {
        if (readManyIteration == NO_INDEX) {
            if (variableName.empty())quit(_wa, ("Integer " + vtos(result) + " violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
            else quit(_wa, ("Integer parameter [name=" + std::string(variableName) + "] equals to " + vtos(result) + ", violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
        } else {
            if (variableName.empty())quit(_wa, ("Integer element [index=" + vtos(readManyIteration) + "] equals to " + vtos(result) + ", violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
            else quit(_wa, ("Integer element " + std::string(variableName) + "[" + vtos(readManyIteration) + "] equals to " + vtos(result) + ", violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
        }
    }
    if (strict && !variableName.empty())validator.addBoundsHit(variableName, ValidatorBoundsHit(minv == result, maxv == result));
    return result;
}
std::vector<long long> InStream::readLongs(int size, long long minv, long long maxv, const std::string& variablesName, int indexBase) {
    __testlib_readMany(readLongs, readLong(minv, maxv, variablesName), long long, true)
}
std::vector<long long> InStream::readLongs(int size, int indexBase) {
    __testlib_readMany(readLongs, readLong(), long long, true)
}
unsigned long long InStream::readUnsignedLong(unsigned long long minv, unsigned long long maxv, const std::string& variableName) {
    unsigned long long result = readUnsignedLong();
    if (result < minv || result > maxv) {
        if (readManyIteration == NO_INDEX) {
            if (variableName.empty())quit(_wa, ("Unsigned integer " + vtos(result) + " violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
            else quit(_wa, ("Unsigned integer parameter [name=" + std::string(variableName) + "] equals to " + vtos(result) + ", violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
        } else {
            if (variableName.empty())quit(_wa, ("Unsigned integer element [index=" + vtos(readManyIteration) + "] equals to " + vtos(result) + ", violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
            else quit(_wa, ("Unsigned integer element " + std::string(variableName) + "[" + vtos(readManyIteration) + "] equals to " + vtos(result) + ", violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
        }
    }
    if (strict && !variableName.empty())validator.addBoundsHit(variableName, ValidatorBoundsHit(minv == result, maxv == result));
    return result;
}
std::vector<unsigned long long> InStream::readUnsignedLongs(int size, unsigned long long minv, unsigned long long maxv, const std::string& variablesName, int indexBase) {
    __testlib_readMany(readUnsignedLongs, readUnsignedLong(minv, maxv, variablesName), unsigned long long, true)
}
std::vector<unsigned long long> InStream::readUnsignedLongs(int size, int indexBase) {
    __testlib_readMany(readUnsignedLongs, readUnsignedLong(), unsigned long long, true)
}
unsigned long long InStream::readLong(unsigned long long minv, unsigned long long maxv, const std::string& variableName) {
    return readUnsignedLong(minv, maxv, variableName);
}
int InStream::readInt() {
    return readInteger();
}
int InStream::readInt(int minv, int maxv, const std::string& variableName) {
    int result = readInt();
    if (result < minv || result > maxv) {
        if (readManyIteration == NO_INDEX) {
            if (variableName.empty())quit(_wa, ("Integer " + vtos(result) + " violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
            else quit(_wa, ("Integer parameter [name=" + std::string(variableName) + "] equals to " + vtos(result) + ", violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
        } else {
            if (variableName.empty())quit(_wa, ("Integer element [index=" + vtos(readManyIteration) + "] equals to " + vtos(result) + ", violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
            else quit(_wa, ("Integer element " + std::string(variableName) + "[" + vtos(readManyIteration) + "] equals to " + vtos(result) + ", violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
        }
    }
    if (strict && !variableName.empty())validator.addBoundsHit(variableName, ValidatorBoundsHit(minv == result, maxv == result));
    return result;
}
int InStream::readInteger(int minv, int maxv, const std::string& variableName) {
    return readInt(minv, maxv, variableName);
}
std::vector<int> InStream::readInts(int size, int minv, int maxv, const std::string& variablesName, int indexBase) {
    __testlib_readMany(readInts, readInt(minv, maxv, variablesName), int, true)
}
std::vector<int> InStream::readInts(int size, int indexBase) {
    __testlib_readMany(readInts, readInt(), int, true)
}
std::vector<int> InStream::readIntegers(int size, int minv, int maxv, const std::string& variablesName, int indexBase) {
    __testlib_readMany(readIntegers, readInt(minv, maxv, variablesName), int, true)
}
std::vector<int> InStream::readIntegers(int size, int indexBase) {
    __testlib_readMany(readIntegers, readInt(), int, true)
}
double InStream::readReal() {
    if (!strict && seekEof())quit(_unexpected_eof, "Unexpected end of file - double expected");
    return stringToDouble(*this, readWord().c_str());
}
double InStream::readDouble() {
    return readReal();
}
double InStream::readReal(double minv, double maxv, const std::string& variableName) {
    double result = readReal();
    if (result < minv || result > maxv) {
        if (readManyIteration == NO_INDEX) {
            if (variableName.empty())quit(_wa, ("Double " + vtos(result) + " violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
            else quit(_wa, ("Double parameter [name=" + std::string(variableName) + "] equals to " + vtos(result) + ", violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
        } else {
            if (variableName.empty())quit(_wa, ("Double element [index=" + vtos(readManyIteration) + "] equals to " + vtos(result) + ", violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
            else quit(_wa, ("Double element " + std::string(variableName) + "[" + vtos(readManyIteration) + "] equals to " + vtos(result) + ", violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
        }
    }
    if (strict && !variableName.empty())validator.addBoundsHit(variableName, ValidatorBoundsHit(doubleDelta(minv, result) < ValidatorBoundsHit::EPS, doubleDelta(maxv, result) < ValidatorBoundsHit::EPS));
    return result;
}
std::vector<double> InStream::readReals(int size, double minv, double maxv, const std::string& variablesName, int indexBase) {
    __testlib_readMany(readReals, readReal(minv, maxv, variablesName), double, true)
}
std::vector<double> InStream::readReals(int size, int indexBase) {
    __testlib_readMany(readReals, readReal(), double, true)
}
double InStream::readDouble(double minv, double maxv, const std::string& variableName) {
    return readReal(minv, maxv, variableName);
}
std::vector<double> InStream::readDoubles(int size, double minv, double maxv, const std::string& variablesName, int indexBase) {
    __testlib_readMany(readDoubles, readDouble(minv, maxv, variablesName), double, true)
}
std::vector<double> InStream::readDoubles(int size, int indexBase) {
    __testlib_readMany(readDoubles, readDouble(), double, true)
}
double InStream::readStrictReal(double minv, double maxv,
    int minAfterPointDigitCount, int maxAfterPointDigitCount,
    const std::string& variableName) {
    if (!strict && seekEof())quit(_unexpected_eof, "Unexpected end of file - strict double expected");
    double result = stringToStrictDouble(*this, readWord().c_str(),
        minAfterPointDigitCount, maxAfterPointDigitCount);
    if (result < minv || result > maxv) {
        if (readManyIteration == NO_INDEX) {
            if (variableName.empty())quit(_wa, ("Strict double " + vtos(result) + " violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
            else quit(_wa, ("Strict double parameter [name=" + std::string(variableName) + "] equals to " + vtos(result) + ", violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
        } else {
            if (variableName.empty())quit(_wa, ("Strict double element [index=" + vtos(readManyIteration) + "] equals to " + vtos(result) + ", violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
            else quit(_wa, ("Strict double element " + std::string(variableName) + "[" + vtos(readManyIteration) + "] equals to " + vtos(result) + ", violates the range [" + vtos(minv) + ", " + vtos(maxv) + "]").c_str());
        }
    }
    if (strict && !variableName.empty())validator.addBoundsHit(variableName, ValidatorBoundsHit(doubleDelta(minv, result) < ValidatorBoundsHit::EPS, doubleDelta(maxv, result) < ValidatorBoundsHit::EPS));
    return result;
}
std::vector<double> InStream::readStrictReals(int size, double minv, double maxv,
    int minAfterPointDigitCount, int maxAfterPointDigitCount,
    const std::string& variablesName, int indexBase) {
    __testlib_readMany(readStrictReals, readStrictReal(minv, maxv, minAfterPointDigitCount, maxAfterPointDigitCount, variablesName), double, true)
}
double InStream::readStrictDouble(double minv, double maxv,
    int minAfterPointDigitCount, int maxAfterPointDigitCount,
    const std::string& variableName) {
    return readStrictReal(minv, maxv,
        minAfterPointDigitCount, maxAfterPointDigitCount,
        variableName);
}
std::vector<double> InStream::readStrictDoubles(int size, double minv, double maxv,
    int minAfterPointDigitCount, int maxAfterPointDigitCount,
    const std::string& variablesName, int indexBase) {
    __testlib_readMany(readStrictDoubles, readStrictDouble(minv, maxv, minAfterPointDigitCount, maxAfterPointDigitCount, variablesName), double, true)
}
bool InStream::eof() {
    if (!strict && NULL == reader)return true;
    return reader->eof();
}
bool InStream::seekEof() {
    if (!strict && NULL == reader)return true;
    skipBlanks();
    return eof();
}
bool InStream::eoln() {
    if (!strict && NULL == reader)return true;
    int c = reader->nextChar();
    if (!strict) {
        if (c == EOFC)return true;
        if (c == CR) {
            c = reader->nextChar();
            if (c != LF) {
                reader->unreadChar(c);
                reader->unreadChar(CR);
                return false;
            } else return true;
        }
        if (c == LF)return true;
        reader->unreadChar(c);
        return false;
    } else {
        bool returnCr = false;
#if (defined(ON_WINDOWS) && !defined(FOR_LINUX)) || defined(FOR_WINDOWS)
        if (c != CR) {
            reader->unreadChar(c);
            return false;
        } else {
            if (!returnCr)returnCr = true;
            c = reader->nextChar();
        }
#endif
        if (c != LF) {
            reader->unreadChar(c);
            if (returnCr)reader->unreadChar(CR);
            return false;
        }
        return true;
        }
    }
void InStream::readEoln() {
    lastLine = reader->getLine();
    if (!eoln())quit(_pe, "Expected EOLN");
}
void InStream::readEof() {
    lastLine = reader->getLine();
    if (!eof())quit(_pe, "Expected EOF");
    if (TestlibFinalizeGuard::alive && this == &inf)testlibFinalizeGuard.readEofCount++;
}
bool InStream::seekEoln() {
    if (!strict && NULL == reader)return true;
    int cur;
    do {
        cur = reader->nextChar();
    } while (cur == SPACE || cur == TAB);
    reader->unreadChar(cur);
    return eoln();
}
void InStream::nextLine() {
    readLine();
}
void InStream::readStringTo(std::string& result) {
    if (NULL == reader)quit(_pe, "Expected line");
    result.clear();
    for (;;) {
        int cur = reader->curChar();
        if (cur == LF || cur == EOFC)break;
        if (cur == CR) {
            cur = reader->nextChar();
            if (reader->curChar() == LF) {
                reader->unreadChar(cur);
                break;
            }
        }
        lastLine = reader->getLine();
        result += char(reader->nextChar());
    }
    if (strict)readEoln();
    else eoln();
}
std::string InStream::readString() {
    readStringTo(_tmpReadToken);
    return _tmpReadToken;
}
std::vector<std::string> InStream::readStrings(int size, int indexBase) {
    __testlib_readMany(readStrings, readString(), std::string, false)
}
void InStream::readStringTo(std::string& result, const pattern& p, const std::string& variableName) {
    readStringTo(result);
    if (!p.matches(result)) {
        if (readManyIteration == NO_INDEX) {
            if (variableName.empty())quit(_wa, ("Line \"" + __testlib_part(result) + "\" doesn't correspond to pattern \"" + p.src() + "\"").c_str());
            else quit(_wa, ("Line [name=" + variableName + "] equals to \"" + __testlib_part(result) + "\", doesn't correspond to pattern \"" + p.src() + "\"").c_str());
        } else {
            if (variableName.empty())quit(_wa, ("Line element [index=" + vtos(readManyIteration) + "] equals to \"" + __testlib_part(result) + "\" doesn't correspond to pattern \"" + p.src() + "\"").c_str());
            else quit(_wa, ("Line element " + std::string(variableName) + "[" + vtos(readManyIteration) + "] equals to \"" + __testlib_part(result) + "\", doesn't correspond to pattern \"" + p.src() + "\"").c_str());
        }
    }
}
void InStream::readStringTo(std::string& result, const std::string& ptrn, const std::string& variableName) {
    readStringTo(result, pattern(ptrn), variableName);
}
std::string InStream::readString(const pattern& p, const std::string& variableName) {
    readStringTo(_tmpReadToken, p, variableName);
    return _tmpReadToken;
}
std::vector<std::string> InStream::readStrings(int size, const pattern& p, const std::string& variablesName, int indexBase) {
    __testlib_readMany(readStrings, readString(p, variablesName), std::string, false)
}
std::string InStream::readString(const std::string& ptrn, const std::string& variableName) {
    readStringTo(_tmpReadToken, ptrn, variableName);
    return _tmpReadToken;
}
std::vector<std::string> InStream::readStrings(int size, const std::string& ptrn, const std::string& variablesName, int indexBase) {
    pattern p(ptrn);
    __testlib_readMany(readStrings, readString(p, variablesName), std::string, false)
}
void InStream::readLineTo(std::string& result) {
    readStringTo(result);
}
std::string InStream::readLine() {
    return readString();
}
std::vector<std::string> InStream::readLines(int size, int indexBase) {
    __testlib_readMany(readLines, readString(), std::string, false)
}
void InStream::readLineTo(std::string& result, const pattern& p, const std::string& variableName) {
    readStringTo(result, p, variableName);
}
void InStream::readLineTo(std::string& result, const std::string& ptrn, const std::string& variableName) {
    readStringTo(result, ptrn, variableName);
}
std::string InStream::readLine(const pattern& p, const std::string& variableName) {
    return readString(p, variableName);
}
std::vector<std::string> InStream::readLines(int size, const pattern& p, const std::string& variablesName, int indexBase) {
    __testlib_readMany(readLines, readString(p, variablesName), std::string, false)
}
std::string InStream::readLine(const std::string& ptrn, const std::string& variableName) {
    return readString(ptrn, variableName);
}
std::vector<std::string> InStream::readLines(int size, const std::string& ptrn, const std::string& variablesName, int indexBase) {
    pattern p(ptrn);
    __testlib_readMany(readLines, readString(p, variablesName), std::string, false)
}
#ifdef __GNUC__
__attribute__((format(printf, 3, 4)))
#endif
void InStream::ensuref(bool cond, const char* format, ...) {
    if (!cond) {
        FMT_TO_RESULT(format, format, message);
        this->__testlib_ensure(cond, message);
    }
}
void InStream::__testlib_ensure(bool cond, std::string message) {
    if (!cond)this->quit(_wa, message.c_str());
}
void InStream::close() {
    if (NULL != reader) {
        reader->close();
        delete reader;
        reader = NULL;
    }
    opened = false;
}
NORETURN void quit(TResult result, const std::string& msg) {
    ouf.quit(result, msg.c_str());
}
NORETURN void quit(TResult result, const char* msg) {
    ouf.quit(result, msg);
}
NORETURN void __testlib_quitp(double points, const char* message) {
    __testlib_points = points;
    std::string stringPoints = removeDoubleTrailingZeroes(format("%.10f", points));
    std::string quitMessage;
    if (NULL == message || 0 == strlen(message))quitMessage = stringPoints;
    else quitMessage = stringPoints + " " + message;
    quit(_points, quitMessage.c_str());
}
NORETURN void __testlib_quitp(int points, const char* message) {
    __testlib_points = points;
    std::string stringPoints = format("%d", points);
    std::string quitMessage;
    if (NULL == message || 0 == strlen(message))quitMessage = stringPoints;
    else quitMessage = stringPoints + " " + message;
    quit(_points, quitMessage.c_str());
}
NORETURN void quitp(float points, const std::string& message = "") {
    __testlib_quitp(double(points), message.c_str());
}
NORETURN void quitp(double points, const std::string& message = "") {
    __testlib_quitp(points, message.c_str());
}
NORETURN void quitp(long double points, const std::string& message = "") {
    __testlib_quitp(double(points), message.c_str());
}
NORETURN void quitp(int points, const std::string& message = "") {
    __testlib_quitp(points, message.c_str());
}
template <typename F>
#ifdef __GNUC__
__attribute__((format(printf, 2, 3)))
#endif
NORETURN void quitp(F points, const char* format, ...) {
    FMT_TO_RESULT(format, format, message);
    quitp(points, message);
}
#ifdef __GNUC__
__attribute__((format(printf, 2, 3)))
#endif
NORETURN void quitf(TResult result, const char* format, ...) {
    FMT_TO_RESULT(format, format, message);
    quit(result, message);
}
#ifdef __GNUC__
__attribute__((format(printf, 3, 4)))
#endif
void quitif(bool condition, TResult result, const char* format, ...) {
    if (condition) {
        FMT_TO_RESULT(format, format, message);
        quit(result, message);
    }
}
static void __testlib_ensuresPreconditions() {
    __TESTLIB_STATIC_ASSERT(sizeof(int) == 4);
    __TESTLIB_STATIC_ASSERT(INT_MAX == 2147483647);
    __TESTLIB_STATIC_ASSERT(sizeof(long long) == 8);
    __TESTLIB_STATIC_ASSERT(sizeof(double) == 8);
    if (!__testlib_isNaN(+__testlib_nan()))quit(_fail, "Function __testlib_isNaN is not working correctly: possible reason is '-ffast-math'");
    if (!__testlib_isNaN(-__testlib_nan()))quit(_fail, "Function __testlib_isNaN is not working correctly: possible reason is '-ffast-math'");
}
void registerGen(int argc, char* argv[], int randomGeneratorVersion) {
    if (randomGeneratorVersion < 0 || randomGeneratorVersion > 1)quitf(_fail, "Random generator version is expected to be 0 or 1.");
    random_t::version = randomGeneratorVersion;
    __testlib_ensuresPreconditions();
    testlibMode = _generator;
    __testlib_set_binary(stdin);
    rnd.setSeed(argc, argv);
}
#ifdef USE_RND_AS_BEFORE_087
void registerGen(int argc, char* argv[]) {
    registerGen(argc, argv, 0);
}
#else
#ifdef __GNUC__
#if (__GNUC__ > 4) || ((__GNUC__ == 4) && (__GNUC_MINOR__ > 4))
__attribute__((deprecated("Use registerGen(argc, argv, 0) or registerGen(argc, argv, 1)."
    " The third parameter stands for the random generator version."
    " If you are trying to compile old generator use macro -DUSE_RND_AS_BEFORE_087 or registerGen(argc, argv, 0)."
    " Version 1 has been released on Spring, 2013. Use it to write new generators.")))
#else
__attribute__((deprecated))
#endif
#endif
#ifdef _MSC_VER
__declspec(deprecated("Use registerGen(argc, argv, 0) or registerGen(argc, argv, 1)."
    " The third parameter stands for the random generator version."
    " If you are trying to compile old generator use macro -DUSE_RND_AS_BEFORE_087 or registerGen(argc, argv, 0)."
    " Version 1 has been released on Spring, 2013. Use it to write new generators."))
#endif
    void registerGen(int argc, char* argv[]) {
    std::fprintf(stderr, "Use registerGen(argc, argv, 0) or registerGen(argc, argv, 1)."
        " The third parameter stands for the random generator version."
        " If you are trying to compile old generator use macro -DUSE_RND_AS_BEFORE_087 or registerGen(argc, argv, 0)."
        " Version 1 has been released on Spring, 2013. Use it to write new generators.\n\n");
    registerGen(argc, argv, 0);
}
#endif
void registerInteraction(int argc, char* argv[]) {
    __testlib_ensuresPreconditions();
    testlibMode = _interactor;
    __testlib_set_binary(stdin);
    if (argc < 3 || argc > 6) {
        quit(_fail, std::string("Program must be run with the following arguments: ") + std::string("<input-file> <output-file> [<answer-file> [<report-file> [<-appes>]]]") + "\nUse \"--help\" to get help information");
    }
    if (argc <= 4) {
        resultName = "";
        appesMode = false;
    }
#ifndef EJUDGE
    if (argc == 5) {
        resultName = argv[4];
        appesMode = false;
    }
    if (argc == 6) {
        resultName = argv[4];
        appesMode = true;
    }
#endif
    inf.init(argv[1], _input);
    tout.open(argv[2], std::ios_base::out);
    if (tout.fail() || !tout.is_open())quit(_fail, std::string("Can not write to the test-output-file '") + argv[2] + std::string("'"));
    ouf.init(stdin, _output);
    if (argc >= 4)ans.init(argv[3], _answer);
    else ans.name = "unopened answer stream";
}
void registerValidation() {
    __testlib_ensuresPreconditions();
    testlibMode = _validator;
    __testlib_set_binary(stdin);
    inf.init(stdin, _input);
    inf.strict = true;
}
void registerValidation(int argc, char* argv[]) {
    registerValidation();
    for (int i = 1; i < argc; i++) {
        if (!strcmp("--testset", argv[i])) {
            if (i + 1 < argc && strlen(argv[i + 1]) > 0)validator.setTestset(argv[++i]);
            else quit(_fail, std::string("Validator must be run with the following arguments: ") + "[--testset testset] [--group group] [--testOverviewLogFileName fileName]");
        }
        if (!strcmp("--group", argv[i])) {
            if (i + 1 < argc)validator.setGroup(argv[++i]);
            else quit(_fail, std::string("Validator must be run with the following arguments: ") + "[--testset testset] [--group group] [--testOverviewLogFileName fileName]");
        }
        if (!strcmp("--testOverviewLogFileName", argv[i])) {
            if (i + 1 < argc)validator.setTestOverviewLogFileName(argv[++i]);
            else quit(_fail, std::string("Validator must be run with the following arguments: ") + "[--testset testset] [--group group] [--testOverviewLogFileName fileName]");
        }
    }
}
void addFeature(const std::string& feature) {
    if (testlibMode != _validator)quit(_fail, "Features are supported in validators only.");
    validator.addFeature(feature);
}
void feature(const std::string& feature) {
    if (testlibMode != _validator)quit(_fail, "Features are supported in validators only.");
    validator.feature(feature);
}
void registerTestlibCmd(int argc, char* argv[]) {
    __testlib_ensuresPreconditions();
    testlibMode = _checker;
    __testlib_set_binary(stdin);
    if (argc < 4 || argc > 6) {
        quit(_fail, std::string("Program must be run with the following arguments: ") + std::string("<input-file> <output-file> <answer-file> [<report-file> [<-appes>]]") + "\nUse \"--help\" to get help information");
    }
    if (argc == 4) {
        resultName = "";
        appesMode = false;
    }
    if (argc == 5) {
        resultName = argv[4];
        appesMode = false;
    }
    if (argc == 6) {
        if (strcmp("-APPES", argv[5]) && strcmp("-appes", argv[5])) {
            quit(_fail, std::string("Program must be run with the following arguments: ") + "<input-file> <output-file> <answer-file> [<report-file> [<-appes>]]");
        } else {
            resultName = argv[4];
            appesMode = true;
        }
    }
    inf.init(argv[1], _input);
    ouf.init(argv[2], _output);
    ans.init(argv[3], _answer);
}
void registerTestlib(int argc, ...) {
    if (argc < 3 || argc > 5)quit(_fail, std::string("Program must be run with the following arguments: ") + "<input-file> <output-file> <answer-file> [<report-file> [<-appes>]]");
    char** argv = new char* [argc + 1];
    va_list ap;
    va_start(ap, argc);
    argv[0] = NULL;
    for (int i = 0; i < argc; i++) {
        argv[i + 1] = va_arg(ap, char*);
    }
    va_end(ap);
    registerTestlibCmd(argc + 1, argv);
    delete[] argv;
}
static inline void __testlib_ensure(bool cond, const std::string& msg) {
    if (!cond)quit(_fail, msg.c_str());
}
#ifdef __GNUC__
__attribute__((unused))
#endif
static inline void __testlib_ensure(bool cond, const char* msg) {
    if (!cond)quit(_fail, msg);
}
#define ensure(cond) __testlib_ensure(cond, "Condition failed: \"" #cond "\"")
#ifdef __GNUC__
__attribute__((format(printf, 2, 3)))
#endif
inline void ensuref(bool cond, const char* format, ...) {
    if (!cond) {
        FMT_TO_RESULT(format, format, message);
        __testlib_ensure(cond, message);
    }
}
NORETURN static void __testlib_fail(const std::string& message) {
    quitf(_fail, "%s", message.c_str());
}
#ifdef __GNUC__
__attribute__((format(printf, 1, 2)))
#endif
void setName(const char* format, ...) {
    FMT_TO_RESULT(format, format, name);
    checkerName = name;
}
template <typename _RandomAccessIter>
void shuffle(_RandomAccessIter __first, _RandomAccessIter __last) {
    if (__first == __last) return;
    for (_RandomAccessIter __i = __first + 1; __i != __last; ++__i)std::iter_swap(__i, __first + rnd.next(int(__i - __first) + 1));
}
template <typename _RandomAccessIter>
#if defined(__GNUC__) && !defined(__clang__)
__attribute__((error("Don't use random_shuffle(), use shuffle() instead")))
#endif
void random_shuffle(_RandomAccessIter, _RandomAccessIter) {
    quitf(_fail, "Don't use random_shuffle(), use shuffle() instead");
}
#ifdef __GLIBC__
#define RAND_THROW_STATEMENT throw()
#else
#define RAND_THROW_STATEMENT
#endif
#if defined(__GNUC__) && !defined(__clang__)
__attribute__((error("Don't use rand(), use rnd.next() instead")))
#endif
#ifdef _MSC_VER
#pragma warning(disable : 4273)
#endif
int rand() RAND_THROW_STATEMENT {
    quitf(_fail, "Don't use rand(), use rnd.next() instead");
}
#if defined(__GNUC__) && !defined(__clang__)
__attribute__((error("Don't use srand(), you should use "
    "'registerGen(argc, argv, 1);' to initialize generator seed "
    "by hash code of the command line params. The third parameter "
    "is randomGeneratorVersion (currently the latest is 1).")))
#endif
#ifdef _MSC_VER
#pragma warning(disable : 4273)
#endif
    void srand(unsigned int seed) RAND_THROW_STATEMENT {
    quitf(_fail, "Don't use srand(), you should use "
        "'registerGen(argc, argv, 1);' to initialize generator seed "
        "by hash code of the command line params. The third parameter "
        "is randomGeneratorVersion (currently the latest is 1) [ignored seed=%d].",
        seed);
}
void startTest(int test) {
    const std::string testFileName = vtos(test);
    if (NULL == freopen(testFileName.c_str(), "wt", stdout))__testlib_fail("Unable to write file '" + testFileName + "'");
}
inline std::string upperCase(std::string s) {
    for (size_t i = 0; i < s.length(); i++)if ('a' <= s[i] && s[i] <= 'z')s[i] = char(s[i] - 'a' + 'A');
    return s;
}
inline std::string lowerCase(std::string s) {
    for (size_t i = 0; i < s.length(); i++)if ('A' <= s[i] && s[i] <= 'Z')s[i] = char(s[i] - 'A' + 'a');
    return s;
}
inline std::string compress(const std::string& s) {
    return __testlib_part(s);
}
inline std::string englishEnding(int x) {
    x %= 100;
    if (x / 10 == 1)return "th";
    if (x % 10 == 1)return "st";
    if (x % 10 == 2)return "nd";
    if (x % 10 == 3)return "rd";
    return "th";
}
template <typename _ForwardIterator, typename _Separator>
std::string join(_ForwardIterator first, _ForwardIterator last, _Separator separator) {
    std::stringstream ss;
    bool repeated = false;
    for (_ForwardIterator i = first; i != last; i++) {
        if (repeated)ss << separator;
        else repeated = true;
        ss << *i;
    }
    return ss.str();
}
template <typename _ForwardIterator>
std::string join(_ForwardIterator first, _ForwardIterator last) {
    return join(first, last, ' ');
}
template <typename _Collection, typename _Separator>
std::string join(const _Collection& collection, _Separator separator) {
    return join(collection.begin(), collection.end(), separator);
}
template <typename _Collection>
std::string join(const _Collection& collection) {
    return join(collection, ' ');
}
std::vector<std::string> split(const std::string& s, char separator) {
    std::vector<std::string> result;
    std::string item;
    for (size_t i = 0; i < s.length(); i++) {
        if (s[i] == separator) {
            result.push_back(item);
            item = "";
        } else item += s[i];
    }
    result.push_back(item);
    return result;
}
std::vector<std::string> split(const std::string& s, const std::string& separators) {
    if (separators.empty())return std::vector<std::string>(1, s);
    std::vector<bool> isSeparator(256);
    for (size_t i = 0; i < separators.size(); i++)isSeparator[(unsigned char)(separators[i])] = true;
    std::vector<std::string> result;
    std::string item;
    for (size_t i = 0; i < s.length(); i++) {
        if (isSeparator[(unsigned char)(s[i])]) {
            result.push_back(item);
            item = "";
        } else item += s[i];
    }
    result.push_back(item);
    return result;
}
std::vector<std::string> tokenize(const std::string& s, char separator) {
    std::vector<std::string> result;
    std::string item;
    for (size_t i = 0; i < s.length(); i++)if (s[i] == separator) {
        if (!item.empty())result.push_back(item);
        item = "";
    } else item += s[i];
    if (!item.empty())result.push_back(item);
    return result;
}
std::vector<std::string> tokenize(const std::string& s, const std::string& separators) {
    if (separators.empty())return std::vector<std::string>(1, s);
    std::vector<bool> isSeparator(256);
    for (size_t i = 0; i < separators.size(); i++) isSeparator[(unsigned char)(separators[i])] = true;
    std::vector<std::string> result;
    std::string item;
    for (size_t i = 0; i < s.length(); i++) {
        if (isSeparator[(unsigned char)(s[i])]) {
            if (!item.empty())result.push_back(item);
            item = "";
        } else item += s[i];
    }
    if (!item.empty())result.push_back(item);
    return result;
}
NORETURN void __testlib_expectedButFound(TResult result, std::string expected, std::string found, const char* prepend) {
    std::string message;
    if (strlen(prepend) != 0)message = format("%s: expected '%s', but found '%s'",
        compress(prepend).c_str(), compress(expected).c_str(), compress(found).c_str());
    else message = format("expected '%s', but found '%s'",
        compress(expected).c_str(), compress(found).c_str());
    quit(result, message);
}
NORETURN void __testlib_expectedButFound(TResult result, double expected, double found, const char* prepend) {
    std::string expectedString = removeDoubleTrailingZeroes(format("%.12f", expected));
    std::string foundString = removeDoubleTrailingZeroes(format("%.12f", found));
    __testlib_expectedButFound(result, expectedString, foundString, prepend);
}
template <typename T>
#ifdef __GNUC__
__attribute__((format(printf, 4, 5)))
#endif
NORETURN void expectedButFound(TResult result, T expected, T found, const char* prependFormat = "", ...) {
    FMT_TO_RESULT(prependFormat, prependFormat, prepend);
    std::string expectedString = vtos(expected);
    std::string foundString = vtos(found);
    __testlib_expectedButFound(result, expectedString, foundString, prepend.c_str());
}
template <>
#ifdef __GNUC__
__attribute__((format(printf, 4, 5)))
#endif
NORETURN void expectedButFound<std::string>(TResult result, std::string expected, std::string found, const char* prependFormat, ...) {
    FMT_TO_RESULT(prependFormat, prependFormat, prepend);
    __testlib_expectedButFound(result, expected, found, prepend.c_str());
}
template <>
#ifdef __GNUC__
__attribute__((format(printf, 4, 5)))
#endif
NORETURN void expectedButFound<double>(TResult result, double expected, double found, const char* prependFormat, ...) {
    FMT_TO_RESULT(prependFormat, prependFormat, prepend);
    std::string expectedString = removeDoubleTrailingZeroes(format("%.12f", expected));
    std::string foundString = removeDoubleTrailingZeroes(format("%.12f", found));
    __testlib_expectedButFound(result, expectedString, foundString, prepend.c_str());
}
template <>
#ifdef __GNUC__
__attribute__((format(printf, 4, 5)))
#endif
NORETURN void expectedButFound<const char*>(TResult result, const char* expected, const char* found, const char* prependFormat, ...) {
    FMT_TO_RESULT(prependFormat, prependFormat, prepend);
    __testlib_expectedButFound(result, std::string(expected), std::string(found), prepend.c_str());
}
template <>
#ifdef __GNUC__
__attribute__((format(printf, 4, 5)))
#endif
NORETURN void expectedButFound<float>(TResult result, float expected, float found, const char* prependFormat, ...) {
    FMT_TO_RESULT(prependFormat, prependFormat, prepend);
    __testlib_expectedButFound(result, double(expected), double(found), prepend.c_str());
}
template <>
#ifdef __GNUC__
__attribute__((format(printf, 4, 5)))
#endif
NORETURN void expectedButFound<long double>(TResult result, long double expected, long double found, const char* prependFormat, ...) {
    FMT_TO_RESULT(prependFormat, prependFormat, prepend);
    __testlib_expectedButFound(result, double(expected), double(found), prepend.c_str());
}
#if __cplusplus > 199711L || defined(_MSC_VER)
template <typename T>
struct is_iterable {
    template <typename U>
    static char test(typename U::iterator* x);
    template <typename U>
    static long test(U* x);
    static const bool value = sizeof(test<T>(0)) == 1;
};
template <bool B, class T = void>
struct __testlib_enable_if {};
template <class T>
struct __testlib_enable_if<true, T> { typedef T type; };
template <typename T>
typename __testlib_enable_if<!is_iterable<T>::value, void>::type __testlib_print_one(const T& t) {
    std::cout << t;
}
template <typename T>
typename __testlib_enable_if<is_iterable<T>::value, void>::type __testlib_print_one(const T& t) {
    bool first = true;
    for (typename T::const_iterator i = t.begin(); i != t.end(); i++) {
        if (first)first = false;
        else std::cout << " ";
        std::cout << *i;
    }
}
template <>
typename __testlib_enable_if<is_iterable<std::string>::value, void>::type __testlib_print_one<std::string>(const std::string& t) {
    std::cout << t;
}
template <typename A, typename B>
void __println_range(A begin, B end) {
    bool first = true;
    for (B i = B(begin); i != end; i++) {
        if (first)first = false;
        else std::cout << " ";
        __testlib_print_one(*i);
    }
    std::cout << std::endl;
}
template <class T, class Enable = void>
struct is_iterator {
    static T makeT();
    typedef void* twoptrs[2];
    static twoptrs& test(...);
    template <class R>
    static typename R::iterator_category* test(R);
    template <class R>
    static void* test(R*);
    static const bool value = sizeof(test(makeT())) == sizeof(void*);
};
template <class T>
struct is_iterator<T, typename __testlib_enable_if<std::is_array<T>::value>::type> {
    static const bool value = false;
};
template <typename A, typename B>
typename __testlib_enable_if<!is_iterator<B>::value, void>::type println(const A& a, const B& b) {
    __testlib_print_one(a);
    std::cout << " ";
    __testlib_print_one(b);
    std::cout << std::endl;
}
template <typename A, typename B>
typename __testlib_enable_if<is_iterator<B>::value, void>::type println(const A& a, const B& b) {
    __println_range(a, b);
}
template <typename A>
void println(const A* a, const A* b) {
    __println_range(a, b);
}
template <>
void println<char>(const char* a, const char* b) {
    __testlib_print_one(a);
    std::cout << " ";
    __testlib_print_one(b);
    std::cout << std::endl;
}
template <typename T>
void println(const T& x) {
    __testlib_print_one(x);
    std::cout << std::endl;
}
template <typename A, typename B, typename C>
void println(const A& a, const B& b, const C& c) {
    __testlib_print_one(a);
    std::cout << " ";
    __testlib_print_one(b);
    std::cout << " ";
    __testlib_print_one(c);
    std::cout << std::endl;
}
template <typename A, typename B, typename C, typename D>
void println(const A& a, const B& b, const C& c, const D& d) {
    __testlib_print_one(a);
    std::cout << " ";
    __testlib_print_one(b);
    std::cout << " ";
    __testlib_print_one(c);
    std::cout << " ";
    __testlib_print_one(d);
    std::cout << std::endl;
}
template <typename A, typename B, typename C, typename D, typename E>
void println(const A& a, const B& b, const C& c, const D& d, const E& e) {
    __testlib_print_one(a);
    std::cout << " ";
    __testlib_print_one(b);
    std::cout << " ";
    __testlib_print_one(c);
    std::cout << " ";
    __testlib_print_one(d);
    std::cout << " ";
    __testlib_print_one(e);
    std::cout << std::endl;
}
template <typename A, typename B, typename C, typename D, typename E, typename F>
void println(const A& a, const B& b, const C& c, const D& d, const E& e, const F& f) {
    __testlib_print_one(a);
    std::cout << " ";
    __testlib_print_one(b);
    std::cout << " ";
    __testlib_print_one(c);
    std::cout << " ";
    __testlib_print_one(d);
    std::cout << " ";
    __testlib_print_one(e);
    std::cout << " ";
    __testlib_print_one(f);
    std::cout << std::endl;
}
template <typename A, typename B, typename C, typename D, typename E, typename F, typename G>
void println(const A& a, const B& b, const C& c, const D& d, const E& e, const F& f, const G& g) {
    __testlib_print_one(a);
    std::cout << " ";
    __testlib_print_one(b);
    std::cout << " ";
    __testlib_print_one(c);
    std::cout << " ";
    __testlib_print_one(d);
    std::cout << " ";
    __testlib_print_one(e);
    std::cout << " ";
    __testlib_print_one(f);
    std::cout << " ";
    __testlib_print_one(g);
    std::cout << std::endl;
}
#endif
#endif