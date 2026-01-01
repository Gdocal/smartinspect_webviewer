/**
 * Transform Engine - Parse and execute metric expressions
 *
 * Supported functions:
 *   rate($value)              - Rate of change per second
 *   delta($value)             - Difference from previous value
 *   avg($value, window)       - Moving average (window: 1m, 5m, etc.)
 *   min($value, window)       - Minimum in window
 *   max($value, window)       - Maximum in window
 *   sum($value, window)       - Sum over window
 *   abs($value)               - Absolute value
 *   round($value, decimals)   - Round to N decimals
 *
 * Operators: + - * / % ( )
 *
 * Examples:
 *   rate(requests) * 60                    - Requests per minute
 *   errors / requests * 100                - Error percentage
 *   avg(response_time, 1m)                 - 1-minute moving average
 *   (memory_used / memory_total) * 100     - Memory usage %
 */

export interface HistoryPoint {
    timestamp: number;
    value: number;
}

export interface TransformContext {
    // Current value of the watch
    currentValue: number;
    // Historical data points for windowed functions
    history: HistoryPoint[];
    // Named values for multi-series expressions (e.g., {requests: 100, errors: 5})
    namedValues?: Record<string, number>;
    // Named histories for multi-series
    namedHistories?: Record<string, HistoryPoint[]>;
}

// Compiled expression for caching
interface CompiledExpression {
    evaluate: (ctx: TransformContext) => number;
}

// Expression cache
const expressionCache = new Map<string, CompiledExpression>();

/**
 * Parse a window string like "1m", "5m", "1h" into milliseconds
 */
function parseWindow(windowStr: string): number {
    const match = windowStr.match(/^(\d+)(s|m|h)$/);
    if (!match) return 60000; // Default 1 minute

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        default: return 60000;
    }
}

/**
 * Get points within a time window from history
 */
function getPointsInWindow(history: HistoryPoint[], windowMs: number): HistoryPoint[] {
    const now = Date.now();
    const cutoff = now - windowMs;
    return history.filter(p => p.timestamp >= cutoff);
}

/**
 * Built-in transform functions
 */
const functions: Record<string, (args: any[], ctx: TransformContext) => number> = {
    // Rate of change per second
    rate: (args, ctx) => {
        const history = args[0] as HistoryPoint[] || ctx.history;
        if (history.length < 2) return 0;

        const first = history[0];
        const last = history[history.length - 1];
        const timeDiffSec = (last.timestamp - first.timestamp) / 1000;

        if (timeDiffSec <= 0) return 0;
        return (last.value - first.value) / timeDiffSec;
    },

    // Difference from previous value
    delta: (args, ctx) => {
        const history = args[0] as HistoryPoint[] || ctx.history;
        if (history.length < 2) return 0;

        const prev = history[history.length - 2];
        const curr = history[history.length - 1];
        return curr.value - prev.value;
    },

    // Moving average over window
    avg: (args, ctx) => {
        const history = args[0] as HistoryPoint[] || ctx.history;
        const windowMs = args[1] ? parseWindow(args[1]) : 60000;

        const points = getPointsInWindow(history, windowMs);
        if (points.length === 0) return ctx.currentValue;

        return points.reduce((sum, p) => sum + p.value, 0) / points.length;
    },

    // Minimum in window
    min: (args, ctx) => {
        const history = args[0] as HistoryPoint[] || ctx.history;
        const windowMs = args[1] ? parseWindow(args[1]) : 60000;

        const points = getPointsInWindow(history, windowMs);
        if (points.length === 0) return ctx.currentValue;

        return Math.min(...points.map(p => p.value));
    },

    // Maximum in window
    max: (args, ctx) => {
        const history = args[0] as HistoryPoint[] || ctx.history;
        const windowMs = args[1] ? parseWindow(args[1]) : 60000;

        const points = getPointsInWindow(history, windowMs);
        if (points.length === 0) return ctx.currentValue;

        return Math.max(...points.map(p => p.value));
    },

    // Sum over window
    sum: (args, ctx) => {
        const history = args[0] as HistoryPoint[] || ctx.history;
        const windowMs = args[1] ? parseWindow(args[1]) : 60000;

        const points = getPointsInWindow(history, windowMs);
        return points.reduce((sum, p) => sum + p.value, 0);
    },

    // Absolute value
    abs: (args) => {
        return Math.abs(args[0] as number);
    },

    // Round to N decimals
    round: (args) => {
        const value = args[0] as number;
        const decimals = args[1] ?? 0;
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    },

    // Percentile / quantile calculation
    // Usage: percentile($value, 0.95) or percentile($value, 95)
    percentile: (args, ctx) => {
        const history = args[0] as HistoryPoint[] || ctx.history;
        let p = args[1] as number ?? 0.5;

        // If percentile given as 0-100, convert to 0-1
        if (p > 1) p = p / 100;

        if (history.length === 0) return ctx.currentValue;

        const sorted = [...history].map(h => h.value).sort((a, b) => a - b);
        const index = (sorted.length - 1) * p;
        const lower = Math.floor(index);
        const upper = Math.ceil(index);

        if (lower === upper) return sorted[lower];

        // Linear interpolation
        return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
    },

    // Standard deviation
    stddev: (args, ctx) => {
        const history = args[0] as HistoryPoint[] || ctx.history;
        const windowMs = args[1] ? parseWindow(args[1]) : 60000;

        const points = getPointsInWindow(history, windowMs);
        if (points.length < 2) return 0;

        const values = points.map(p => p.value);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;

        return Math.sqrt(variance);
    },

    // Median (50th percentile)
    median: (args, ctx) => {
        return functions.percentile([args[0], 0.5], ctx);
    },

    // Count of points in window
    count: (args, ctx) => {
        const history = args[0] as HistoryPoint[] || ctx.history;
        const windowMs = args[1] ? parseWindow(args[1]) : 60000;

        const points = getPointsInWindow(history, windowMs);
        return points.length;
    },

    // Increase (non-negative delta, for counters)
    increase: (args, ctx) => {
        const history = args[0] as HistoryPoint[] || ctx.history;
        if (history.length < 2) return 0;

        const first = history[0];
        const last = history[history.length - 1];
        const diff = last.value - first.value;

        // For counters, negative means reset - return 0
        return diff >= 0 ? diff : 0;
    },

    // irate (instant rate - rate over last two points)
    irate: (args, ctx) => {
        const history = args[0] as HistoryPoint[] || ctx.history;
        if (history.length < 2) return 0;

        const prev = history[history.length - 2];
        const curr = history[history.length - 1];
        const timeDiffSec = (curr.timestamp - prev.timestamp) / 1000;

        if (timeDiffSec <= 0) return 0;
        return (curr.value - prev.value) / timeDiffSec;
    },

    // Clamp value between min and max
    clamp: (args) => {
        const value = args[0] as number;
        const minVal = args[1] as number ?? 0;
        const maxVal = args[2] as number ?? 100;
        return Math.min(Math.max(value, minVal), maxVal);
    },

    // Clamp minimum
    clamp_min: (args) => {
        const value = args[0] as number;
        const minVal = args[1] as number ?? 0;
        return Math.max(value, minVal);
    },

    // Clamp maximum
    clamp_max: (args) => {
        const value = args[0] as number;
        const maxVal = args[1] as number ?? 100;
        return Math.min(value, maxVal);
    },

    // Floor
    floor: (args) => {
        return Math.floor(args[0] as number);
    },

    // Ceil
    ceil: (args) => {
        return Math.ceil(args[0] as number);
    },

    // Log base 10
    log10: (args) => {
        const value = args[0] as number;
        return value > 0 ? Math.log10(value) : 0;
    },

    // Natural log
    ln: (args) => {
        const value = args[0] as number;
        return value > 0 ? Math.log(value) : 0;
    },

    // Square root
    sqrt: (args) => {
        const value = args[0] as number;
        return value >= 0 ? Math.sqrt(value) : 0;
    },

    // Power
    pow: (args) => {
        const base = args[0] as number;
        const exp = args[1] as number ?? 2;
        return Math.pow(base, exp);
    },
};

/**
 * Tokenize expression string
 */
interface Token {
    type: 'number' | 'identifier' | 'operator' | 'paren' | 'comma' | 'string';
    value: string | number;
}

function tokenize(expr: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    while (i < expr.length) {
        const char = expr[i];

        // Skip whitespace
        if (/\s/.test(char)) {
            i++;
            continue;
        }

        // Numbers
        if (/[0-9.]/.test(char)) {
            let num = '';
            while (i < expr.length && /[0-9.]/.test(expr[i])) {
                num += expr[i++];
            }
            tokens.push({ type: 'number', value: parseFloat(num) });
            continue;
        }

        // Identifiers (function names, variable names)
        if (/[a-zA-Z_$]/.test(char)) {
            let id = '';
            while (i < expr.length && /[a-zA-Z0-9_$]/.test(expr[i])) {
                id += expr[i++];
            }
            tokens.push({ type: 'identifier', value: id });
            continue;
        }

        // Operators
        if (/[+\-*/%]/.test(char)) {
            tokens.push({ type: 'operator', value: char });
            i++;
            continue;
        }

        // Parentheses
        if (/[()]/.test(char)) {
            tokens.push({ type: 'paren', value: char });
            i++;
            continue;
        }

        // Comma
        if (char === ',') {
            tokens.push({ type: 'comma', value: ',' });
            i++;
            continue;
        }

        // String literals (for window expressions like "1m")
        if (char === '"' || char === "'") {
            const quote = char;
            let str = '';
            i++; // Skip opening quote
            while (i < expr.length && expr[i] !== quote) {
                str += expr[i++];
            }
            i++; // Skip closing quote
            tokens.push({ type: 'string', value: str });
            continue;
        }

        // Unknown character - skip
        i++;
    }

    return tokens;
}

/**
 * Simple recursive descent parser and evaluator
 */
function parseAndEvaluate(tokens: Token[], ctx: TransformContext): number {
    let pos = 0;

    function current(): Token | undefined {
        return tokens[pos];
    }

    function consume(): Token {
        return tokens[pos++];
    }

    function parseExpression(): number {
        return parseAddSub();
    }

    function parseAddSub(): number {
        let left = parseMulDiv();

        while (current()?.type === 'operator' &&
               (current()?.value === '+' || current()?.value === '-')) {
            const op = consume().value;
            const right = parseMulDiv();
            left = op === '+' ? left + right : left - right;
        }

        return left;
    }

    function parseMulDiv(): number {
        let left = parseUnary();

        while (current()?.type === 'operator' &&
               (current()?.value === '*' || current()?.value === '/' || current()?.value === '%')) {
            const op = consume().value;
            const right = parseUnary();
            if (op === '*') left = left * right;
            else if (op === '/') left = right !== 0 ? left / right : 0;
            else left = right !== 0 ? left % right : 0;
        }

        return left;
    }

    function parseUnary(): number {
        if (current()?.type === 'operator' && current()?.value === '-') {
            consume();
            return -parsePrimary();
        }
        return parsePrimary();
    }

    function parsePrimary(): number {
        const token = current();

        if (!token) return 0;

        // Number literal
        if (token.type === 'number') {
            consume();
            return token.value as number;
        }

        // Parenthesized expression
        if (token.type === 'paren' && token.value === '(') {
            consume(); // '('
            const result = parseExpression();
            if (current()?.type === 'paren' && current()?.value === ')') {
                consume(); // ')'
            }
            return result;
        }

        // Identifier - could be function call or variable reference
        if (token.type === 'identifier') {
            const name = consume().value as string;

            // Function call
            if (current()?.type === 'paren' && current()?.value === '(') {
                consume(); // '('
                const args: any[] = [];

                while (current() && !(current()?.type === 'paren' && current()?.value === ')')) {
                    // Check for identifier argument (watch name)
                    if (current()?.type === 'identifier') {
                        const argName = consume().value as string;
                        // Get history for this watch if available
                        const history = ctx.namedHistories?.[argName] || ctx.history;
                        args.push(history);
                    } else if (current()?.type === 'string') {
                        args.push(consume().value);
                    } else if (current()?.type === 'number') {
                        args.push(consume().value);
                    } else {
                        args.push(parseExpression());
                    }

                    // Skip comma
                    if (current()?.type === 'comma') {
                        consume();
                    }
                }

                if (current()?.type === 'paren' && current()?.value === ')') {
                    consume(); // ')'
                }

                // Call function
                const fn = functions[name];
                if (fn) {
                    return fn(args, ctx);
                }

                return 0;
            }

            // Variable reference
            // Special case: $value refers to current value
            if (name === '$value' || name === 'value') {
                return ctx.currentValue;
            }

            // Named value from context
            if (ctx.namedValues?.[name] !== undefined) {
                return ctx.namedValues[name];
            }

            return 0;
        }

        return 0;
    }

    return parseExpression();
}

/**
 * Compile an expression string for repeated evaluation
 */
function compileExpression(expr: string): CompiledExpression {
    const tokens = tokenize(expr);

    return {
        evaluate: (ctx: TransformContext) => {
            try {
                return parseAndEvaluate([...tokens], ctx);
            } catch (e) {
                console.error('Expression evaluation error:', e);
                return ctx.currentValue;
            }
        }
    };
}

/**
 * Evaluate a transform expression
 */
export function evaluateExpression(expr: string, ctx: TransformContext): number {
    if (!expr || expr.trim() === '') {
        return ctx.currentValue;
    }

    // Check cache
    let compiled = expressionCache.get(expr);
    if (!compiled) {
        compiled = compileExpression(expr);
        expressionCache.set(expr, compiled);
    }

    return compiled.evaluate(ctx);
}

/**
 * Get list of available functions for autocomplete
 */
export function getAvailableFunctions(): { name: string; signature: string; description: string }[] {
    return [
        // Time-based aggregations
        { name: 'rate', signature: 'rate($value)', description: 'Rate of change per second' },
        { name: 'irate', signature: 'irate($value)', description: 'Instant rate (last 2 points)' },
        { name: 'delta', signature: 'delta($value)', description: 'Difference from previous value' },
        { name: 'increase', signature: 'increase($value)', description: 'Non-negative delta (for counters)' },
        { name: 'avg', signature: 'avg($value, "1m")', description: 'Moving average over window' },
        { name: 'min', signature: 'min($value, "1m")', description: 'Minimum in window' },
        { name: 'max', signature: 'max($value, "1m")', description: 'Maximum in window' },
        { name: 'sum', signature: 'sum($value, "1m")', description: 'Sum over window' },
        { name: 'count', signature: 'count($value, "1m")', description: 'Count of points in window' },

        // Statistical
        { name: 'percentile', signature: 'percentile($value, 95)', description: 'Nth percentile (0-100 or 0-1)' },
        { name: 'median', signature: 'median($value)', description: '50th percentile' },
        { name: 'stddev', signature: 'stddev($value, "1m")', description: 'Standard deviation' },

        // Math
        { name: 'abs', signature: 'abs($value)', description: 'Absolute value' },
        { name: 'round', signature: 'round($value, 2)', description: 'Round to N decimals' },
        { name: 'floor', signature: 'floor($value)', description: 'Round down' },
        { name: 'ceil', signature: 'ceil($value)', description: 'Round up' },
        { name: 'sqrt', signature: 'sqrt($value)', description: 'Square root' },
        { name: 'pow', signature: 'pow($value, 2)', description: 'Power (base^exp)' },
        { name: 'log10', signature: 'log10($value)', description: 'Log base 10' },
        { name: 'ln', signature: 'ln($value)', description: 'Natural log' },

        // Clamping
        { name: 'clamp', signature: 'clamp($value, 0, 100)', description: 'Clamp between min and max' },
        { name: 'clamp_min', signature: 'clamp_min($value, 0)', description: 'Clamp minimum' },
        { name: 'clamp_max', signature: 'clamp_max($value, 100)', description: 'Clamp maximum' },
    ];
}

/**
 * Validate an expression and return error message if invalid
 */
export function validateExpression(expr: string): string | null {
    if (!expr || expr.trim() === '') {
        return null; // Empty is valid (no transform)
    }

    try {
        const tokens = tokenize(expr);
        if (tokens.length === 0) {
            return 'Empty expression';
        }

        // Check for balanced parentheses
        let parenCount = 0;
        for (const token of tokens) {
            if (token.type === 'paren') {
                if (token.value === '(') parenCount++;
                else parenCount--;
                if (parenCount < 0) return 'Unbalanced parentheses';
            }
        }
        if (parenCount !== 0) return 'Unbalanced parentheses';

        // Try to evaluate with dummy context
        const dummyCtx: TransformContext = {
            currentValue: 0,
            history: [],
            namedValues: {},
        };
        parseAndEvaluate([...tokens], dummyCtx);

        return null; // Valid
    } catch (e) {
        return `Invalid expression: ${(e as Error).message}`;
    }
}
