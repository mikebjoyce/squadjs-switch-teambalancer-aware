import Sequelize from 'sequelize';
import DiscordBasePlugin from './discord-base-plugin.js';
import { setTimeout as delay } from "timers/promises";
const { DataTypes, Op } = Sequelize;

export default class Switch extends DiscordBasePlugin {
    static get description() {
        return "Switch plugin";
    }

    static get defaultEnabled() {
        return true;
    }

    static get optionsSpecification() {
        return {
            ...DiscordBasePlugin.optionsSpecification,
            commandPrefix: {
                required: false,
                description: "Prefix of every switch command, can be an array",
                default: [ "!switch", "!change" ]
            },
            // duringMatchSwitchSlots: {
            //     required: true,
            //     description: "Number of switch slots, if one is free a player will instanlty get a switch",
            //     default: 2
            // },
            doubleSwitchCommands: {
                required: false,
                description: 'Array of commands that can be sent in every chat to request a double switch',
                default: [],
                example: [ '!bug', '!stuck', '!doubleswitch' ]
            },
            doubleSwitchCooldownHours: {
                required: false,
                description: "Hours to wait before using again one of the double switch commands",
                default: 0.5
            },
            doubleSwitchDelaySeconds: {
                required: false,
                description: "Delay between the first and second team switch",
                default: 1
            },
            endMatchSwitchSlots: {
                required: false,
                description: "Number of switch slots, players will be put in a queue and switched at the end of the match",
                default: 3
            },
            switchCooldownHours: {
                required: false,
                description: "Hours to wait before using again the !switch command",
                default: 3
            },
            switchCooldownMinutes: {
                required: false,
                description: "Minutes to wait before using again the !switch command (overrides hours if set)",
                default: 10
            },
            switchEnabledMinutes: {
                required: false,
                description: "Time in minutes in which the switch will be enabled after match start or player join",
                default: 5
            },
            doubleSwitchEnabledMinutes: {
                required: false,
                description: "Time in minutes in which the switch will be enabled after match start or player join",
                default: 5
            },
            maxUnbalancedSlots: {
                required: false,
                description: "Number of player of difference between the two teams to allow a team switch",
                default: 3
            },
            switchToOldTeamAfterRejoin: {
                required: false,
                description: "The team of a disconnecting player will be stored and after a new connection, the player will be switched to his old team",
                default: false
            },
            discordChannelID: {
                required: false,
                description: 'Discord channel ID for logs.',
                default: ''
            },
            database: {
                required: true,
                connector: 'sequelize',
                description: 'The Sequelize connector to log server information to.',
                default: 'sqlite'
            },
            scrambleLockdownDurationMinutes: {
                required: false,
                description: "Duration in minutes to block switching after a scramble.",
                default: 20
            }
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);

        this.onChatMessage = this.onChatMessage.bind(this);
        this.onPlayerDisconnected = this.onPlayerDisconnected.bind(this);
        this.onPlayerConnected = this.onPlayerConnected.bind(this);
        this.switchPlayer = this.switchPlayer.bind(this);
        this.getPlayersByUsername = this.getPlayersByUsername.bind(this);
        this.getPlayerBySteamID = this.getPlayerBySteamID.bind(this);
        this.getPlayerByUsernameOrSteamID = this.getPlayerByUsernameOrSteamID.bind(this);
        this.doubleSwitchPlayer = this.doubleSwitchPlayer.bind(this);
        this.getFactionId = this.getFactionId.bind(this);
        this.switchSquad = this.switchSquad.bind(this);
        this.getSecondsFromJoin = this.getSecondsFromJoin.bind(this);
        this.getSecondsFromMatchStart = this.getSecondsFromMatchStart.bind(this);
        this.getTeamBalanceDifference = this.getTeamBalanceDifference.bind(this);
        this.switchToPreDisconnectionTeam = this.switchToPreDisconnectionTeam.bind(this);
        this.getSwitchSlotsPerTeam = this.getSwitchSlotsPerTeam.bind(this);
        this.onRoundEnded = this.onRoundEnded.bind(this);
        this.addPlayerToMatchendSwitches = this.addPlayerToMatchendSwitches.bind(this);
        this.doSwitcMatchend = this.doSwitcMatchend.bind(this);
        this.cleanup = this.cleanup.bind(this);
        this.onScrambleExecuted = this.onScrambleExecuted.bind(this);
        this.checkPlayer = this.checkPlayer.bind(this);
        this.onDiscordMessage = this.onDiscordMessage.bind(this);
        this.getDiagnosticInfo = this.getDiagnosticInfo.bind(this);

        this.playersConnectionTime = [];
        this.matchEndSwitch = new Array(this.options.endMatchSwitchSlots > 0 ? this.options.endMatchSwitchSlots : 0);
        this.recentSwitches = [];
        this.recentDoubleSwitches = [];
        this.recentDisconnetions = [];

        this.models = {};

        this.createModel('Endmatch', {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            name: {
                type: DataTypes.STRING
            },
            steamID: {
                type: DataTypes.STRING
            },
            created_at: {
                type: DataTypes.DATE,
                defaultValue: DataTypes.NOW
            }
        });

        this.createModel('PlayerCooldowns', {
            steamID: {
                type: DataTypes.STRING,
                primaryKey: true
            },
            playerName: {
                type: DataTypes.STRING,
                allowNull: true
            },
            lastSwitchTimestamp: {
                type: DataTypes.DATE,
                allowNull: true
            },
            scrambleLockdownExpiry: {
                type: DataTypes.DATE,
                allowNull: true
            }
        });

        this.broadcast = (msg) => { this.server.rcon.broadcast(msg); };
        this.warn = (steamid, msg) => { this.server.rcon.warn(steamid, msg) };
    }

    async mount() {
        await this.models.PlayerCooldowns.sync();
        this.server.on('CHAT_MESSAGE', this.onChatMessage);
        this.server.on('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
        this.server.on('PLAYER_CONNECTED', this.onPlayerConnected);
        this.server.on('ROUND_ENDED', this.onRoundEnded)
        this.server.on('TEAM_BALANCER_SCRAMBLE_EXECUTED', this.onScrambleExecuted);
        if (this.options.discordClient) {
            this.options.discordClient.on('message', this.onDiscordMessage);
        }

        // setInterval(this.getTeamBalanceDifference,5000)
    }

    async prepareToMount() {
        await this.models.Endmatch.sync();
    }

    createModel(name, schema) {
        this.models[ name ] = this.options.database.define(`SwitchPlugin_${name}`, schema, {
            timestamps: false
        });
    }

    async onChatMessage(info) {
        const steamID = info.player?.steamID;
        const playerName = info.player?.name;
        const teamID = info.player?.teamID;
        const message = info.message.toLowerCase();

        if (this.options.doubleSwitchCommands.find(c => c.toLowerCase() == message))
            this.doubleSwitchPlayer(steamID);

        const commandPrefixInUse = typeof this.options.commandPrefix === 'string' ? this.options.commandPrefix : this.options.commandPrefix.find(c => message.startsWith(c.toLowerCase()));

        if ((typeof this.options.commandPrefix === 'string' && !message.startsWith(this.options.commandPrefix)) || (typeof this.options.commandPrefix === 'object' && this.options.commandPrefix.length >= 1 && !this.options.commandPrefix.find(c => message.startsWith(c.toLowerCase())))) return;

        this.verbose(1, `${playerName}:\n > Connection: ${this.getSecondsFromJoin(steamID)}\n > Match Start: ${this.getSecondsFromMatchStart()}`);
        this.verbose(1, 'Received command', message, commandPrefixInUse);

        const commandSplit = message.substring(commandPrefixInUse.length).trim().split(' ');
        const subCommand = commandSplit[ 0 ];

        const isAdmin = info.chat === "ChatAdmin";
        if (subCommand && subCommand != '') {
            let pl;
            switch (subCommand) {
                case 'now':
                    if (!isAdmin) return;
                    pl = this.getPlayerByUsernameOrSteamID(steamID, commandSplit.splice(1).join(' '))
                    if (pl) this.switchPlayer(pl.steamID);
                    break;
                case 'double':
                    if (!isAdmin) return;
                    pl = this.getPlayerByUsernameOrSteamID(steamID, commandSplit.splice(1).join(' '))
                    if (pl) this.doubleSwitchPlayer(pl.steamID, true);
                    break;
                case 'squad':
                    if (!isAdmin) return;
                    await this.server.updateSquadList();
                    await this.server.updatePlayerList();
                    await this.switchSquad(+commandSplit[ 1 ], commandSplit[ 2 ]);
                    break;
                case 'refresh':
                    await this.server.updateSquadList();
                    await this.server.updatePlayerList();
                    this.warn(steamID, `Players and squads refreshed`);
                    break;
                case 'slots':
                    await this.server.updateSquadList();
                    await this.server.updatePlayerList();
                    this.warn(steamID, `Switch slots per team:\n 1) ${this.getSwitchSlotsPerTeam(1)}\n 2) ${this.getSwitchSlotsPerTeam(2)}`);
                    break;
                case "matchend":
                    if (!isAdmin) return;
                    await this.server.updatePlayerList();
                    // const switchData = {
                    //     from: +info.player.teamID,
                    //     to: [ 1, 2 ].find(i => i != +info.player.teamID)
                    // }

                    // if (matchEndSwitch.filter(s => s.to == switchData.to)) {
                    //     this.matchEndSwitch[ steamID.toString() ] = 
                    // }
                    pl = this.getPlayerByUsernameOrSteamID(steamID, commandSplit.splice(1).join(' '));
                    this.warn(steamID, `Player ${pl.name} will be switched at the end of the current match`);
                    this.addPlayerToMatchendSwitches(pl);
                    break;
                case "doublesquad":
                    if (!isAdmin) return;
                    await this.server.updateSquadList();
                    await this.server.updatePlayerList();
                    this.doubleSwitchSquad(+commandSplit[ 1 ], commandSplit[ 2 ]);
                    break;
                case "matchendsquad":
                    if (!isAdmin) return;
                    await this.server.updateSquadList();
                    await this.server.updatePlayerList();
                    this.warn(steamID, `Squad ${commandSplit[ 1 ]} ${commandSplit[ 2 ]} will be switched at the end of the current match`);
                    await this.addSquadToMatchendSwitches(+commandSplit[ 1 ], commandSplit[ 2 ]);
                    break;
                case "triggermatchend":
                    if (!isAdmin) return;
                    this.warn(steamID, 'Switch: Triggering matchend for testing purposes');
                    await this.doSwitcMatchend();
                    this.warn(steamID, 'Switch: Done');
                    break;
                case "test":
                    this.warn(steamID, 'Test 1');
                    await delay(2000);
                    this.warn(steamID, 'Test 2');
                    setTimeout(() => {
                        this.warn(steamID, 'Test 3');
                    }, 2000);
                    break;
                case "help":
                    let msg = `${this.options.commandPrefix}\n\n > now {username|steamID}\n > double {username|steamID}\n > matchend {username|steamID}\n`;
                    this.warn(steamID, msg);
                    msg = `${this.options.commandPrefix}\n\n > squad {squad_number} {teamID|teamString}\n\n > doublesquad {squad_number} {teamID|teamString}\n > matchendsquad {squad_number} {teamID|teamString}`;
                    this.warn(steamID, msg);
                    msg = `${this.options.commandPrefix}\n\n > check <ident>\n > clear <ident>\n > clearall`;
                    this.warn(steamID, msg);
                    break;
                case "check":
                    {
                        const ident = commandSplit.splice(1).join(' ');
                        if (!ident) {
                            this.warn(steamID, "Usage: !switch check <SteamID|Name>");
                            return;
                        }
                        const result = await this.checkPlayer(ident);
                        if (!result) this.warn(steamID, 'Player not found.');
                        else if (result === 'multiple') this.warn(steamID, 'Multiple players found. Use SteamID.');
                        else {
                            const now = new Date();
                            const locked = result.scrambleLockdownExpiry && result.scrambleLockdownExpiry > now;
                            const cooldown = result.lastSwitchTimestamp && (new Date(result.lastSwitchTimestamp.getTime() + (this.options.switchCooldownMinutes * 60000)) > now);
                            this.warn(steamID, `Player: ${result.playerName || result.steamID} | Locked: ${locked} | Cooldown: ${cooldown}`);
                        }
                    }
                    break;
                case "clear":
                    if (!this.server.admins.includes(steamID)) return;
                    {
                        const ident = commandSplit.splice(1).join(' ');
                        const result = await this.checkPlayer(ident);
                        if (!result || result === 'multiple') {
                            this.warn(steamID, 'Player not found or multiple matches.');
                            return;
                        }
                        await this.options.database.transaction({ type: Sequelize.Transaction.TYPES.IMMEDIATE }, async (t) => {
                            await this.models.PlayerCooldowns.destroy({ where: { steamID: result.steamID }, transaction: t });
                        });
                        this.warn(steamID, `Cleared cooldowns for ${result.playerName || result.steamID}`);
                    }
                    break;
                case "clearall":
                    if (!this.server.admins.includes(steamID)) return;
                    await this.options.database.transaction({ type: Sequelize.Transaction.TYPES.IMMEDIATE }, async (t) => {
                        await this.models.PlayerCooldowns.destroy({ where: {}, truncate: true, transaction: t });
                    });
                    this.warn(steamID, "All player cooldowns cleared.");
                    break;
                default:
                    await this.warn(steamID, `Unknown subcommand: ${subCommand}`);
                    return;
            }
        } else {
            await this.server.updateSquadList();
            await this.server.updatePlayerList();
            const availableSwitchSlots = this.getSwitchSlotsPerTeam(teamID);
            this.verbose(1, playerName, 'requested a switch');
            this.verbose(1, `Team (${teamID}) balance difference:`, availableSwitchSlots);

            const cooldownData = await this.models.PlayerCooldowns.findByPk(steamID);

            if (cooldownData && cooldownData.scrambleLockdownExpiry && new Date() < cooldownData.scrambleLockdownExpiry) {
                const remaining = Math.ceil((cooldownData.scrambleLockdownExpiry - Date.now()) / 60000);
                this.warn(steamID, `You cannot switch for ${remaining} more mins as you were part of the recent scramble.`);
                return;
            }

            if (this.getSecondsFromJoin(steamID) / 60 > this.options.switchEnabledMinutes && this.getSecondsFromMatchStart() / 60 > this.options.switchEnabledMinutes) {
                this.warn(steamID, `A switch can be requested only in the first ${this.options.doubleSwitchEnabledMinutes} minutes from match start or connection to the server`);
                return;
            }

            const cooldownDuration = this.options.switchCooldownMinutes ? this.options.switchCooldownMinutes * 60 * 1000 : this.options.switchCooldownHours * 60 * 60 * 1000;

            if (cooldownData && cooldownData.lastSwitchTimestamp &&
                (Date.now() - new Date(cooldownData.lastSwitchTimestamp).getTime()) < cooldownDuration) {
                const remaining = Math.ceil((cooldownDuration - (Date.now() - new Date(cooldownData.lastSwitchTimestamp).getTime())) / 60000);
                this.warn(steamID, `Switch cooldown active. Wait ${remaining} mins.`);
                return;
            }

            if (availableSwitchSlots <= 0) {
                this.warn(steamID, `Cannot switch now. Team are too unbalanced`);
                return;
            }

           try {
                await this.switchPlayer(steamID);
                await this.options.database.transaction({ type: Sequelize.Transaction.TYPES.IMMEDIATE }, async (t) => {
                    await this.models.PlayerCooldowns.upsert({ steamID, playerName, lastSwitchTimestamp: new Date() }, { transaction: t });
                });
            } catch (err) {
                this.verbose(1, `Error executing switch: ${err.message}`);
                this.warn(steamID, "⚠️ Team switch failed. Please try again or contact an admin.");
            }
        }
    }

    async doSwitcMatchend() {
        const players = await this.models.Endmatch.findAll();
        if (players.length == 0) return;
        players.forEach((pl) => {
            this.warn(pl.steamID, 'You will be switched in 15 seconds');
        });
        await delay(15 * 1000);
        await Promise.all(players.map(async (pl) => {
            this.switchPlayer(pl.steamID);
            return await this.models.Endmatch.destroy({
                where: {
                    id: pl.id
                }
            });
        }));
    }

    async onRoundEnded(dt) {
        await this.cleanup();
        this.doSwitcMatchend();

        for (let p of this.server.players)
            p.teamID = p.teamID == 1 ? 2 : 1;
    }

    getTeamBalanceDifference() {
        let teamPlayerCount = [ null, 0, 0 ];
        for (let p of this.server.players)
            teamPlayerCount[ +p.teamID ]++;
        const balanceDiff = teamPlayerCount[ 1 ] - teamPlayerCount[ 2 ];

        this.verbose(1, `Balance diff: ${balanceDiff}`, teamPlayerCount);
        return balanceDiff;
    }

    getSwitchSlotsPerTeam(teamID) {
        const balanceDifference = this.getTeamBalanceDifference();
        return (this.options.maxUnbalancedSlots) - (teamID == 1 ? -balanceDifference : balanceDifference);
    }

    getSecondsFromJoin(steamID) {
        return (Date.now() - +this.playersConnectionTime[ steamID ]) / 1000;
    }
    getSecondsFromMatchStart() {
        return (Date.now() - +this.server.layerHistory[ 0 ].time) / 1000 || 0; // 0 | Infinity
    }

    async onPlayerConnected(info) {
        const steamID = info.player?.steamID;
        const playerName = info.player?.name;
        const teamID = info.player?.teamID;

        this.verbose(1, `Player connected ${playerName}`);

        this.playersConnectionTime[ steamID ] = new Date();
        this.switchToPreDisconnectionTeam(info);
    }

    async onPlayerDisconnected(info) {
        const steamID = info.player?.steamID;
        // if (!info.player) return;
        const playerName = info.player?.name;
        const teamID = info.player?.teamID;

        // this.recentSwitches = this.recentSwitches.filter(p => p.steamID != steamID);
        this.recentDisconnetions[ steamID ] = { teamID: teamID, time: new Date() };
        this.recentDoubleSwitches = this.recentDoubleSwitches.filter(p => p.steamID != steamID);
    }

    async switchToPreDisconnectionTeam(info) {
        if (!this.options.switchToOldTeamAfterRejoin) return;

        const steamID = info.player?.steamID;

        if (!info.player) return;
        const playerName = info.player?.name;
        const teamID = info.player?.teamID;

        const preDisconnectionData = this.recentDisconnetions[ steamID ];
        if (!preDisconnectionData) return;

        const needSwitch = teamID != preDisconnectionData.teamID;
        this.verbose(1, `${playerName}: Switching to old team: ${needSwitch}`);

        if (Date.now() - preDisconnectionData.time > 60 * 60 * 1000) return;

        if (needSwitch) {
            setTimeout(() => {
                this.switchPlayer(steamID);
            }, 5000)
        }
    }

    async doubleSwitchPlayer(steamID, forced = false, senderSteamID) {
        const recentSwitch = this.recentDoubleSwitches.find(e => e.steamID == steamID);
        const cooldownHoursLeft = (Date.now() - +recentSwitch?.datetime) / (60 * 60 * 1000);

        if (!forced) {
            if (this.getSecondsFromJoin(steamID) / 60 > this.options.doubleSwitchEnabledMinutes && this.getSecondsFromMatchStart() / 60 > this.options.doubleSwitchEnabledMinutes) {
                this.warn(steamID, `A double switch can be requested only in the first ${this.options.doubleSwitchEnabledMinutes} minutes from match start or connection to the server`);
                return;
            }

            if (recentSwitch && cooldownHoursLeft < this.options.doubleSwitchCooldownHours) {
                this.warn(steamID, `You have already requested a double switch in the last ${this.options.doubleSwitchCooldownHours} hours`);
                return;
            }

            if (recentSwitch)
                recentSwitch.datetime = new Date();
            else
                this.recentDoubleSwitches.push({ steamID: steamID, datetime: new Date() });
        }

        await this.server.rcon.execute(`AdminForceTeamChange ${steamID}`);
        await delay(this.options.doubleSwitchDelaySeconds * 1000);
        await this.server.rcon.execute(`AdminForceTeamChange ${steamID}`);

        if (forced && senderSteamID) this.warn(senderSteamID, `Player has been doble-switched`);
    }

    switchSquad(number, team) {
        const players = this.getPlayersFromSquad(number, team);
        if (!players) return;
        for (let p of players)
            this.switchPlayer(p.steamID);
    }

    getPlayersFromSquad(number, team) {
        let team_id = null;

        if (+team >= 0) team_id = +team;
        else team_id = this.getFactionId(team);

        if (!team_id) {
            this.verbose(1, "Could not find a faction from:", team);
            return;
        }
        return this.server.players.filter((p) => p.teamID == team_id && p.squadID == number)
    }

    async doubleSwitchSquad(number, team) {
        const players = this.getPlayersFromSquad(number, team);
        if (!players) return;
        for (let p of players) this.switchPlayer(p.steamID);
        await delay(this.options.doubleSwitchDelaySeconds * 1000);
        for (let p of players) this.switchPlayer(p.steamID);
    }

    async addSquadToMatchendSwitches(number, team) {
        const players = this.getPlayersFromSquad(number, team);
        if (!players) return;
        for (let p of players) {
            await this.models.Endmatch.create({
                name: p.name,
                steamID: p.steamID,
            });
        }
    }

    async addPlayerToMatchendSwitches(player) {
        await this.models.Endmatch.create({
            name: player.name,
            steamID: player.steamID,
        });
    }

    getFactionId(team) {
        const firstPlayer = this.server.players.find(p => p.role.toLowerCase().startsWith(team.toLowerCase()));
        if (firstPlayer) return firstPlayer.teamID;

        return null;
    }

    switchPlayer(steamID) {
        return this.server.rcon.execute(`AdminForceTeamChange ${steamID}`);
    }

    async unmount() {
        this.server.removeListener('CHAT_MESSAGE', this.onChatMessage);
        this.server.removeListener('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
        this.server.removeListener('PLAYER_CONNECTED', this.onPlayerConnected);
        this.server.removeListener('ROUND_ENDED', this.onRoundEnded);
        this.server.removeListener('TEAM_BALANCER_SCRAMBLE_EXECUTED', this.onScrambleExecuted);
        if (this.options.discordClient) this.options.discordClient.removeListener('message', this.onDiscordMessage);
        this.verbose(1, 'Switch plugin was un-mounted.');
    }

    getPlayersByUsername(username) {
        return this.server.players.filter(p =>
            p.name.toLowerCase().includes(username.toLowerCase())
            //&& p.name.length / username.length < 3
        );
    }
    getPlayerBySteamID(steamID) {
        return this.server.players.find(p => p.steamID == steamID);
    }

    getPlayerByUsernameOrSteamID(steamID, ident) {
        let ret = null;

        ret = this.getPlayerBySteamID(ident);
        if (ret) return ret;

        ret = this.getPlayersByUsername(ident);
        if (ret.length == 0) {
            this.warn(steamID, `Could not find a player whose username includes: "${ident}"`);
            return;
        }
        if (ret.length > 1) {
            this.warn(steamID, `Found multiple players whose usernames include: "${ident}"`);
            return;
        }

        return ret[ 0 ];
    }

    async cleanup() {
        const switchCooldownMs = this.options.switchCooldownHours * 60 * 60 * 1000;
        const now = new Date();
        const switchCutoff = new Date(now.getTime() - switchCooldownMs);

        try {
            await this.options.database.transaction({ type: Sequelize.Transaction.TYPES.IMMEDIATE }, async (t) => {
                await this.models.PlayerCooldowns.destroy({
                    where: {
                        [Op.and]: [
                            { 
                                [Op.or]: [
                                    { scrambleLockdownExpiry: null },
                                    { scrambleLockdownExpiry: { [Op.lt]: now } }
                                ]
                            },
                            {
                                [Op.or]: [
                                    { lastSwitchTimestamp: null },
                                    { lastSwitchTimestamp: { [Op.lt]: switchCutoff } }
                                ]
                            }
                        ]
                    },
                    transaction: t
                });
            });
        } catch (err) {
            this.verbose(1, `Cleanup error: ${err.message}`);
        }
    }

    async checkPlayer(ident) {
        let record = await this.models.PlayerCooldowns.findByPk(ident);
        if (record) return record;

        const records = await this.models.PlayerCooldowns.findAll({
            where: {
                playerName: { [Op.like]: `%${ident}%` }
            }
        });

        if (records.length === 0) return null;
        if (records.length > 1) return 'multiple';
        return records[0];
    }

    async onScrambleExecuted(data) {
        const { affectedPlayers } = data;
        if (!affectedPlayers || affectedPlayers.length === 0) return;

        const lockdownDuration = this.options.scrambleLockdownDurationMinutes * 60 * 1000;
        const expiry = new Date(Date.now() + lockdownDuration);

        // Handle both array of strings (old TB) and array of objects (new TB)
        const records = affectedPlayers.map(p => {
            if (typeof p === 'string') return { steamID: p, scrambleLockdownExpiry: expiry };
            return { steamID: p.steamID, playerName: p.name, scrambleLockdownExpiry: expiry };
        });

        try {
            await this.options.database.transaction({ type: Sequelize.Transaction.TYPES.IMMEDIATE }, async (t) => {
                await this.models.PlayerCooldowns.bulkCreate(records, {
                    updateOnDuplicate: ['scrambleLockdownExpiry', 'playerName'],
                    transaction: t
                });
            });
            this.verbose(1, `Switch lockdown active for ${records.length} players until ${expiry.toISOString()}.`);

            if (this.options.discordClient && this.options.discordChannelID) {
                const channel = await this.options.discordClient.channels.fetch(this.options.discordChannelID);
                if (channel) {
                    const embed = {
                        title: '🚨 Scramble Lockout Initiated',
                        description: `${affectedPlayers.length} players barred for ${this.options.scrambleLockdownDurationMinutes} minutes.`,
                        color: 0xFF0000,
                        timestamp: new Date()
                    };
                    channel.send({ embeds: [embed] });
                }
            }
        } catch (err) {
            this.verbose(1, `Error updating scramble lockdown: ${err.message}`);
        }
    }

    async getDiagnosticInfo() {
        let dbStatus = 'Error';
        let activeScrambleLocks = 0;
        let totalStoredPlayers = 0;

        try {
            await this.options.database.authenticate();
            dbStatus = 'Connected';
            totalStoredPlayers = await this.models.PlayerCooldowns.count();
            activeScrambleLocks = await this.models.PlayerCooldowns.count({
                where: { scrambleLockdownExpiry: { [Op.gt]: new Date() } }
            });
        } catch (e) {
            dbStatus = `Error: ${e.message}`;
        }
        return { dbStatus, activeScrambleLocks, totalStoredPlayers };
    }

    async onDiscordMessage(message) {
        if (message.author.bot) return;
        if (this.options.discordChannelID && message.channel.id !== this.options.discordChannelID) return;
        
        const content = message.content.trim();
        const args = content.split(' ');
        const command = args[0].toLowerCase();
        const subCommand = args[1] ? args[1].toLowerCase() : null;

        if (command !== '!switch') return;

        if (subCommand === 'diag') {
            const diag = await this.getDiagnosticInfo();
            const lockedPlayers = await this.models.PlayerCooldowns.findAll({
                where: { scrambleLockdownExpiry: { [Op.gt]: new Date() } },
                order: [['scrambleLockdownExpiry', 'DESC']],
                limit: 10
            });
            const playerList = lockedPlayers.map(p => {
                const ts = Math.floor(p.scrambleLockdownExpiry.getTime() / 1000);
                return `**${p.playerName || p.steamID}**: <t:${ts}:R>`;
            }).join('\n') || 'None';

            const embed = {
                title: '📊 Switch Plugin Diagnostics',
                color: 0x3498db,
                fields: [
                    { name: 'DB Status', value: diag.dbStatus, inline: true },
                    { name: 'Active Locks', value: String(diag.activeScrambleLocks), inline: true },
                    { name: 'Total Players', value: String(diag.totalStoredPlayers), inline: true },
                    { name: 'Top 10 Locked Players', value: playerList }
                ]
            };
            message.channel.send({ embeds: [embed] });
        } else if (subCommand === 'check') {
            const ident = args.slice(2).join(' ');
            if (!ident) {
                message.reply('Usage: `!switch check <SteamID|Name>`');
                return;
            }
            const result = await this.checkPlayer(ident);
            if (!result) {
                message.reply('Player not found in database.');
            } else if (result === 'multiple') {
                message.reply('⚠️ Ambiguous result: Multiple matches found. Please refine your search string or use a SteamID.');
            } else {
                const now = new Date();
                let desc = `**SteamID:** ${result.steamID}\n**Name:** ${result.playerName || 'Unknown'}\n`;
                
                if (result.scrambleLockdownExpiry && result.scrambleLockdownExpiry > now) {
                    desc += `🔴 **Scramble Lock:** <t:${Math.floor(result.scrambleLockdownExpiry.getTime()/1000)}:R>\n`;
                } else {
                    desc += `🟢 **Scramble Lock:** None\n`;
                }

                if (result.lastSwitchTimestamp) {
                    const cooldownDuration = this.options.switchCooldownMinutes ? this.options.switchCooldownMinutes * 60 * 1000 : this.options.switchCooldownHours * 60 * 60 * 1000;
                    const nextSwitch = new Date(result.lastSwitchTimestamp.getTime() + cooldownDuration);
                    if (nextSwitch > now) {
                        desc += `🔴 **Switch Cooldown:** <t:${Math.floor(nextSwitch.getTime()/1000)}:R>\n`;
                    } else {
                        desc += `🟢 **Switch Cooldown:** Ready\n`;
                    }
                } else {
                    desc += `🟢 **Switch Cooldown:** Ready\n`;
                }

                message.channel.send({ embeds: [{ title: '🔍 Player Status', description: desc, color: 0x3498db }] });
            }
        } else if (subCommand === 'clear') {
            const ident = args.slice(2).join(' ');
            if (!ident) {
                message.reply('Usage: `!switch clear <SteamID|Name>`');
                return;
            }
            const result = await this.checkPlayer(ident);
            if (!result || result === 'multiple') {
                message.reply('Player not found or multiple matches.');
                return;
            }
            await this.options.database.transaction({ type: Sequelize.Transaction.TYPES.IMMEDIATE }, async (t) => {
                await this.models.PlayerCooldowns.destroy({ where: { steamID: result.steamID }, transaction: t });
            });
            message.reply(`✅ Cleared cooldowns for **${result.playerName || result.steamID}**.`);
        } else if (subCommand === 'clearall') {
            await this.options.database.transaction({ type: Sequelize.Transaction.TYPES.IMMEDIATE }, async (t) => {
                await this.models.PlayerCooldowns.destroy({ where: {}, truncate: true, transaction: t });
            });
            message.reply('🗑️ All player cooldowns cleared.');
        } else if (subCommand === 'help') {
            const embed = {
                title: '📜 Switch Plugin Commands',
                description: 'Available commands:',
                fields: [
                    { name: '!switch diag', value: 'Show database diagnostics and active locks.' },
                    { name: '!switch check <ident>', value: 'Check cooldown status for a player.' },
                    { name: '!switch clear <ident>', value: 'Clear cooldowns for a specific player.' },
                    { name: '!switch clearall', value: 'Clear all player cooldowns.' },
                    { name: '!switch help', value: 'Show this help message.' }
                ]
            };
            message.channel.send({ embeds: [embed] });
        }
    }
}