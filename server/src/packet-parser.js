/**
 * SmartInspect Binary Packet Parser
 * Parses incoming binary packets from SmartInspect clients
 * (Reverse of the BinaryFormatter)
 */

// Enums (duplicated from client library for server independence)
const PacketType = {
    ControlCommand: 1,
    LogEntry: 4,
    Watch: 5,
    ProcessFlow: 6,
    LogHeader: 7,
    Stream: 8
};

const Level = {
    Debug: 0,
    Verbose: 1,
    Message: 2,
    Warning: 3,
    Error: 4,
    Fatal: 5,
    Control: 6
};

const LogEntryType = {
    Separator: 0,
    EnterMethod: 1,
    LeaveMethod: 2,
    ResetCallstack: 3,
    Message: 100,
    Warning: 101,
    Error: 102,
    InternalError: 103,
    Comment: 104,
    VariableValue: 105,
    Checkpoint: 106,
    Debug: 107,
    Verbose: 108,
    Fatal: 109,
    Conditional: 110,
    Assert: 111,
    Text: 200,
    Binary: 201,
    Graphic: 202,
    Source: 203,
    Object: 204,
    WebContent: 205,
    System: 206,
    MemoryStatistic: 207,
    DatabaseResult: 208,
    DatabaseStructure: 209
};

const ViewerId = {
    None: -1,
    Title: 0,
    Data: 1,
    List: 2,
    ValueList: 3,
    Inspector: 4,
    Table: 5,
    Web: 100,
    Binary: 200,
    HtmlSource: 300,
    JavaScriptSource: 301,
    VbScriptSource: 302,
    PerlSource: 303,
    SqlSource: 304,
    IniSource: 305,
    PythonSource: 306,
    XmlSource: 307,
    Bitmap: 400,
    Jpeg: 401,
    Icon: 402,
    Metafile: 403
};

const WatchType = {
    Char: 0,
    String: 1,
    Integer: 2,
    Float: 3,
    Boolean: 4,
    Address: 5,
    Timestamp: 6,
    Object: 7
};

const ControlCommandType = {
    ClearLog: 0,
    ClearWatches: 1,
    ClearAutoViews: 2,
    ClearAll: 3,
    ClearProcessFlow: 4
};

const ProcessFlowType = {
    EnterMethod: 0,
    LeaveMethod: 1,
    EnterThread: 2,
    LeaveThread: 3,
    EnterProcess: 4,
    LeaveProcess: 5
};

// OLE Automation Date conversion
const DAY_OFFSET = 25569; // Days between 1899-12-30 and 1970-01-01

/**
 * Convert OLE Automation Date to JavaScript Date
 */
function timestampToDate(oleDate) {
    const ms = (oleDate - DAY_OFFSET) * 86400000;
    return new Date(ms);
}

/**
 * Convert 32-bit ARGB integer to color object
 */
function intToColor(colorInt) {
    return {
        r: colorInt & 0xFF,
        g: (colorInt >> 8) & 0xFF,
        b: (colorInt >> 16) & 0xFF,
        a: (colorInt >> 24) & 0xFF
    };
}

/**
 * Get level from LogEntryType
 */
function getLevelFromEntryType(entryType) {
    switch (entryType) {
        case LogEntryType.Debug:
            return Level.Debug;
        case LogEntryType.Verbose:
            return Level.Verbose;
        case LogEntryType.Message:
        case LogEntryType.Text:
        case LogEntryType.Object:
        case LogEntryType.Source:
        case LogEntryType.System:
        case LogEntryType.Checkpoint:
        case LogEntryType.EnterMethod:
        case LogEntryType.LeaveMethod:
            return Level.Message;
        case LogEntryType.Warning:
            return Level.Warning;
        case LogEntryType.Error:
        case LogEntryType.InternalError:
        case LogEntryType.Assert:
            return Level.Error;
        case LogEntryType.Fatal:
            return Level.Fatal;
        default:
            return Level.Message;
    }
}

/**
 * PacketParser - parses SmartInspect binary packets
 */
class PacketParser {
    constructor() {
        this.buffer = Buffer.alloc(0);
    }

    /**
     * Add data to internal buffer
     */
    addData(data) {
        this.buffer = Buffer.concat([this.buffer, data]);
    }

    /**
     * Try to parse packets from buffer
     * Returns array of parsed packets and removes them from buffer
     */
    parsePackets() {
        const packets = [];

        while (this.buffer.length >= 6) {
            // Packet header: [packetType(2)] [dataSize(4)]
            const packetType = this.buffer.readInt16LE(0);
            const dataSize = this.buffer.readInt32LE(2);

            // Check if we have the complete packet
            if (this.buffer.length < 6 + dataSize) {
                break;
            }

            // Extract packet data
            const data = this.buffer.slice(6, 6 + dataSize);

            // Parse packet based on type
            let packet = null;
            try {
                packet = this.parsePacket(packetType, data);
            } catch (err) {
                console.error('Error parsing packet:', err.message);
            }

            if (packet) {
                packets.push(packet);
            }

            // Remove processed data from buffer
            this.buffer = this.buffer.slice(6 + dataSize);
        }

        return packets;
    }

    /**
     * Parse a single packet based on its type
     */
    parsePacket(packetType, data) {
        switch (packetType) {
            case PacketType.LogHeader:
                return this.parseLogHeader(data);
            case PacketType.LogEntry:
                return this.parseLogEntry(data);
            case PacketType.Watch:
                return this.parseWatch(data);
            case PacketType.ProcessFlow:
                return this.parseProcessFlow(data);
            case PacketType.ControlCommand:
                return this.parseControlCommand(data);
            case PacketType.Stream:
                return this.parseStream(data);
            default:
                return null;
        }
    }

    /**
     * Parse LogHeader packet
     */
    parseLogHeader(data) {
        if (data.length < 4) return null;

        const contentLen = data.readInt32LE(0);
        const content = contentLen > 0 ? data.slice(4, 4 + contentLen).toString('utf8') : '';

        return {
            packetType: PacketType.LogHeader,
            type: 'logHeader',
            content
        };
    }

    /**
     * Parse LogEntry packet
     */
    parseLogEntry(data) {
        if (data.length < 48) return null;

        let offset = 0;

        // Fixed fields
        const logEntryType = data.readInt32LE(offset); offset += 4;
        const viewerId = data.readInt32LE(offset); offset += 4;
        const appNameLen = data.readInt32LE(offset); offset += 4;
        const sessionNameLen = data.readInt32LE(offset); offset += 4;
        const titleLen = data.readInt32LE(offset); offset += 4;
        const hostNameLen = data.readInt32LE(offset); offset += 4;
        const dataLen = data.readInt32LE(offset); offset += 4;
        const processId = data.readInt32LE(offset); offset += 4;
        const threadId = data.readInt32LE(offset); offset += 4;
        const timestamp = data.readDoubleLE(offset); offset += 8;
        const colorInt = data.readUInt32LE(offset); offset += 4;

        // Variable length fields
        const appName = appNameLen > 0 ? data.slice(offset, offset + appNameLen).toString('utf8') : '';
        offset += appNameLen;

        const sessionName = sessionNameLen > 0 ? data.slice(offset, offset + sessionNameLen).toString('utf8') : '';
        offset += sessionNameLen;

        const title = titleLen > 0 ? data.slice(offset, offset + titleLen).toString('utf8') : '';
        offset += titleLen;

        const hostName = hostNameLen > 0 ? data.slice(offset, offset + hostNameLen).toString('utf8') : '';
        offset += hostNameLen;

        const entryData = dataLen > 0 ? data.slice(offset, offset + dataLen) : null;

        return {
            packetType: PacketType.LogEntry,
            type: 'logEntry',
            logEntryType,
            viewerId,
            appName,
            sessionName,
            title,
            hostName,
            processId,
            threadId,
            timestamp: timestampToDate(timestamp),
            color: intToColor(colorInt),
            data: entryData,
            level: getLevelFromEntryType(logEntryType)
        };
    }

    /**
     * Parse Watch packet
     * Format v2 (with group): [nameLen(4)] [valueLen(4)] [watchType(4)] [timestamp(8)] [groupLen(4)] [name] [value] [group]
     * Format v1 (legacy): [nameLen(4)] [valueLen(4)] [watchType(4)] [timestamp(8)] [name] [value]
     */
    parseWatch(data) {
        if (data.length < 20) return null;

        let offset = 0;

        const nameLen = data.readInt32LE(offset); offset += 4;
        const valueLen = data.readInt32LE(offset); offset += 4;
        const watchType = data.readInt32LE(offset); offset += 4;
        const timestamp = data.readDoubleLE(offset); offset += 8;

        // v1 header size = 20, v2 header size = 24 (adds groupLen)
        const v1HeaderSize = 20;
        const v2HeaderSize = 24;

        // Detect v2 format: check if there's a groupLen field and packet size matches v2
        let group = '';
        let groupLen = 0;

        // Check if we have v2 format by looking at packet size
        const v2ExpectedSize = v2HeaderSize + nameLen + valueLen;
        if (data.length >= v2ExpectedSize) {
            // Read potential groupLen
            groupLen = data.readInt32LE(offset);
            // Validate: v2 format if total size matches
            const v2TotalExpected = v2HeaderSize + nameLen + valueLen + groupLen;
            if (data.length >= v2TotalExpected && groupLen >= 0 && groupLen < 1000) {
                offset += 4; // skip groupLen, it's v2 format
            } else {
                // It's v1 format, no groupLen field
                groupLen = 0;
            }
        }

        const name = nameLen > 0 ? data.slice(offset, offset + nameLen).toString('utf8') : '';
        offset += nameLen;

        const value = valueLen > 0 ? data.slice(offset, offset + valueLen).toString('utf8') : '';
        offset += valueLen;

        if (groupLen > 0) {
            group = data.slice(offset, offset + groupLen).toString('utf8');
        }

        return {
            packetType: PacketType.Watch,
            type: 'watch',
            name,
            value,
            watchType,
            timestamp: timestampToDate(timestamp),
            group
        };
    }

    /**
     * Parse ProcessFlow packet
     */
    parseProcessFlow(data) {
        if (data.length < 28) return null;

        let offset = 0;

        const processFlowType = data.readInt32LE(offset); offset += 4;
        const titleLen = data.readInt32LE(offset); offset += 4;
        const hostNameLen = data.readInt32LE(offset); offset += 4;
        const processId = data.readInt32LE(offset); offset += 4;
        const threadId = data.readInt32LE(offset); offset += 4;
        const timestamp = data.readDoubleLE(offset); offset += 8;

        const title = titleLen > 0 ? data.slice(offset, offset + titleLen).toString('utf8') : '';
        offset += titleLen;

        const hostName = hostNameLen > 0 ? data.slice(offset, offset + hostNameLen).toString('utf8') : '';

        return {
            packetType: PacketType.ProcessFlow,
            type: 'processFlow',
            processFlowType,
            title,
            hostName,
            processId,
            threadId,
            timestamp: timestampToDate(timestamp)
        };
    }

    /**
     * Parse ControlCommand packet
     */
    parseControlCommand(data) {
        if (data.length < 8) return null;

        let offset = 0;

        const controlCommandType = data.readInt32LE(offset); offset += 4;
        const dataLen = data.readInt32LE(offset); offset += 4;

        const commandData = dataLen > 0 ? data.slice(offset, offset + dataLen) : null;

        return {
            packetType: PacketType.ControlCommand,
            type: 'controlCommand',
            controlCommandType,
            data: commandData
        };
    }

    /**
     * Parse Stream packet
     * Format v3 (with group): [channelLen(4)] [dataLen(4)] [typeLen(4)] [timestamp(8)] [groupLen(4)] [channel] [data] [type] [group]
     * Format v2 (with type): [channelLen(4)] [dataLen(4)] [typeLen(4)] [timestamp(8)] [channel] [data] [type]
     * Format v1 (legacy): [channelLen(4)] [dataLen(4)] [timestamp(8)] [channel] [data]
     */
    parseStream(data) {
        if (data.length < 16) return null;

        let offset = 0;

        const channelLen = data.readInt32LE(offset); offset += 4;
        const dataLen = data.readInt32LE(offset); offset += 4;

        // Check format version by reading potential typeLen
        const potentialTypeLen = data.readInt32LE(offset);
        const v1HeaderSize = 16;
        const v2HeaderSize = 20;
        const v3HeaderSize = 24;

        // Calculate expected sizes for each format
        const v1ExpectedSize = v1HeaderSize + channelLen + dataLen;
        const v2ExpectedSize = v2HeaderSize + channelLen + dataLen + potentialTypeLen;

        let streamType = '';
        let group = '';
        let timestamp;
        let channel;
        let streamData;

        // Try v3 first (has groupLen after timestamp)
        if (data.length >= v2HeaderSize + 4 && potentialTypeLen >= 0 && potentialTypeLen < 1000) {
            offset += 4; // skip typeLen
            timestamp = data.readDoubleLE(offset); offset += 8;

            // Check for v3 format (groupLen field after timestamp)
            const potentialGroupLen = data.readInt32LE(offset);
            const v3ExpectedSize = v3HeaderSize + channelLen + dataLen + potentialTypeLen + potentialGroupLen;

            if (data.length >= v3ExpectedSize && potentialGroupLen >= 0 && potentialGroupLen < 1000) {
                // v3 format with group
                offset += 4; // skip groupLen

                channel = channelLen > 0 ? data.slice(offset, offset + channelLen).toString('utf8') : '';
                offset += channelLen;

                streamData = dataLen > 0 ? data.slice(offset, offset + dataLen).toString('utf8') : '';
                offset += dataLen;

                streamType = potentialTypeLen > 0 ? data.slice(offset, offset + potentialTypeLen).toString('utf8') : '';
                offset += potentialTypeLen;

                group = potentialGroupLen > 0 ? data.slice(offset, offset + potentialGroupLen).toString('utf8') : '';
            } else {
                // v2 format with type but no group
                channel = channelLen > 0 ? data.slice(offset, offset + channelLen).toString('utf8') : '';
                offset += channelLen;

                streamData = dataLen > 0 ? data.slice(offset, offset + dataLen).toString('utf8') : '';
                offset += dataLen;

                streamType = potentialTypeLen > 0 ? data.slice(offset, offset + potentialTypeLen).toString('utf8') : '';
            }
        } else {
            // v1 format without type (legacy)
            timestamp = data.readDoubleLE(offset); offset += 8;

            channel = channelLen > 0 ? data.slice(offset, offset + channelLen).toString('utf8') : '';
            offset += channelLen;

            streamData = dataLen > 0 ? data.slice(offset, offset + dataLen).toString('utf8') : '';
        }

        return {
            packetType: PacketType.Stream,
            type: 'stream',
            channel,
            data: streamData,
            streamType,
            timestamp: timestampToDate(timestamp),
            group
        };
    }
}

module.exports = {
    PacketParser,
    PacketType,
    Level,
    LogEntryType,
    ViewerId,
    WatchType,
    ControlCommandType,
    ProcessFlowType,
    getLevelFromEntryType
};
