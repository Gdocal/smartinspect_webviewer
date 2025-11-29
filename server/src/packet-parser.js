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
    LogHeader: 7
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
     */
    parseWatch(data) {
        if (data.length < 20) return null;

        let offset = 0;

        const nameLen = data.readInt32LE(offset); offset += 4;
        const valueLen = data.readInt32LE(offset); offset += 4;
        const watchType = data.readInt32LE(offset); offset += 4;
        const timestamp = data.readDoubleLE(offset); offset += 8;

        const name = nameLen > 0 ? data.slice(offset, offset + nameLen).toString('utf8') : '';
        offset += nameLen;

        const value = valueLen > 0 ? data.slice(offset, offset + valueLen).toString('utf8') : '';

        return {
            packetType: PacketType.Watch,
            type: 'watch',
            name,
            value,
            watchType,
            timestamp: timestampToDate(timestamp)
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
