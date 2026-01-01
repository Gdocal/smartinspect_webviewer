/**
 * LTTB (Largest Triangle Three Buckets) Data Decimation
 *
 * High-performance data reduction algorithm that preserves visual characteristics
 * of time series data. Much better than simple sampling for visualization.
 *
 * Reference: https://skemman.is/bitstream/1946/15343/3/SS_MSthesis.pdf
 */

export interface DataPoint {
    x: number;  // timestamp
    y: number;  // value
}

/**
 * Reduces data points using LTTB algorithm
 *
 * @param data Array of data points with x (timestamp) and y (value)
 * @param targetPoints Target number of output points
 * @returns Reduced array preserving visual shape
 */
export function lttb(data: DataPoint[], targetPoints: number): DataPoint[] {
    if (data.length <= targetPoints) {
        return data;
    }

    if (targetPoints < 3) {
        return [data[0], data[data.length - 1]];
    }

    const result: DataPoint[] = [];

    // Always include first point
    result.push(data[0]);

    // Calculate bucket size
    const bucketSize = (data.length - 2) / (targetPoints - 2);

    let a = 0; // Index of previous selected point

    for (let i = 0; i < targetPoints - 2; i++) {
        // Calculate bucket boundaries
        const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
        const bucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length - 1);

        // Calculate average point in next bucket (for triangle area calculation)
        const nextBucketStart = bucketEnd;
        const nextBucketEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, data.length);

        let avgX = 0;
        let avgY = 0;
        let avgCount = 0;

        for (let j = nextBucketStart; j < nextBucketEnd; j++) {
            avgX += data[j].x;
            avgY += data[j].y;
            avgCount++;
        }

        if (avgCount > 0) {
            avgX /= avgCount;
            avgY /= avgCount;
        } else {
            // Use last point if no points in next bucket
            avgX = data[data.length - 1].x;
            avgY = data[data.length - 1].y;
        }

        // Find point in current bucket with largest triangle area
        let maxArea = -1;
        let maxAreaIndex = bucketStart;

        const pointA = data[a];

        for (let j = bucketStart; j < bucketEnd; j++) {
            // Calculate triangle area using cross product
            const area = Math.abs(
                (pointA.x - avgX) * (data[j].y - pointA.y) -
                (pointA.x - data[j].x) * (avgY - pointA.y)
            ) * 0.5;

            if (area > maxArea) {
                maxArea = area;
                maxAreaIndex = j;
            }
        }

        result.push(data[maxAreaIndex]);
        a = maxAreaIndex;
    }

    // Always include last point
    result.push(data[data.length - 1]);

    return result;
}

/**
 * Converts uPlot aligned data format to DataPoint array for a specific series
 *
 * @param times Array of timestamps (seconds)
 * @param values Array of values for one series
 * @returns Array of DataPoints (nulls filtered out)
 */
export function uplotToDataPoints(times: number[], values: (number | null)[]): DataPoint[] {
    const points: DataPoint[] = [];

    for (let i = 0; i < times.length; i++) {
        if (values[i] !== null && values[i] !== undefined) {
            points.push({ x: times[i], y: values[i] as number });
        }
    }

    return points;
}

/**
 * Converts DataPoint array back to separate times and values arrays
 *
 * @param points Array of DataPoints
 * @returns Object with times and values arrays
 */
export function dataPointsToUplot(points: DataPoint[]): { times: number[]; values: number[] } {
    return {
        times: points.map(p => p.x),
        values: points.map(p => p.y),
    };
}

/**
 * Determines optimal target points based on chart width
 * Rule of thumb: ~2 points per pixel for smooth curves
 *
 * @param dataLength Number of input data points
 * @param chartWidth Width of chart in pixels
 * @returns Target number of points
 */
export function getOptimalTargetPoints(dataLength: number, chartWidth: number): number {
    const maxPoints = Math.min(chartWidth * 2, 2000); // Cap at 2000 points
    return Math.min(dataLength, maxPoints);
}

/**
 * Decimate uPlot series data if needed
 *
 * @param times Array of timestamps (seconds)
 * @param seriesData Array of value arrays (one per series)
 * @param chartWidth Width of chart in pixels
 * @returns Decimated data in same format
 */
export function decimateSeriesData(
    times: number[],
    seriesData: (number | null)[][],
    chartWidth: number
): { times: number[]; seriesData: (number | null)[][] } {
    const targetPoints = getOptimalTargetPoints(times.length, chartWidth);

    if (times.length <= targetPoints) {
        return { times, seriesData };
    }

    // For each series, apply LTTB
    const decimatedSeries: (number | null)[][] = [];

    // We need to find common timestamps after decimation
    // Strategy: decimate first non-null series and use those timestamps

    let referencePoints: DataPoint[] | null = null;

    for (let s = 0; s < seriesData.length; s++) {
        const values = seriesData[s];
        const points = uplotToDataPoints(times, values);

        if (points.length > 0 && !referencePoints) {
            referencePoints = lttb(points, targetPoints);
        }
    }

    if (!referencePoints || referencePoints.length === 0) {
        return { times, seriesData };
    }

    // Filter out any undefined points and create time lookup
    const validPoints = referencePoints.filter(p => p && typeof p.x === 'number');
    if (validPoints.length === 0) {
        return { times, seriesData };
    }

    const newTimes = validPoints.map(p => p.x);

    // Filter each series to only include reference timestamps
    for (let s = 0; s < seriesData.length; s++) {
        const values = seriesData[s];
        const newValues: (number | null)[] = [];

        // Create a map from old times to values
        const timeToValue = new Map<number, number | null>();
        for (let i = 0; i < times.length; i++) {
            timeToValue.set(times[i], values[i]);
        }

        // Get values for new timestamps
        for (const t of newTimes) {
            newValues.push(timeToValue.get(t) ?? null);
        }

        decimatedSeries.push(newValues);
    }

    return {
        times: newTimes,
        seriesData: decimatedSeries,
    };
}
