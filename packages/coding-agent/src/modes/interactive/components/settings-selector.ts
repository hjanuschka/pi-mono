import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Transport } from "@mariozechner/pi-ai";
import {
	Container,
	getCapabilities,
	getKeybindings,
	Input,
	type SelectItem,
	SelectList,
	type SelectListLayoutOptions,
	type SettingItem,
	SettingsList,
	Spacer,
	Text,
} from "@mariozechner/pi-tui";
import { getSelectListTheme, getSettingsListTheme, theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";

const SETTINGS_SUBMENU_SELECT_LIST_LAYOUT: SelectListLayoutOptions = {
	minPrimaryColumnWidth: 12,
	maxPrimaryColumnWidth: 32,
};

const THINKING_DESCRIPTIONS: Record<ThinkingLevel, string> = {
	off: "No reasoning",
	minimal: "Very brief reasoning (~1k tokens)",
	low: "Light reasoning (~2k tokens)",
	medium: "Moderate reasoning (~8k tokens)",
	high: "Deep reasoning (~16k tokens)",
	xhigh: "Maximum reasoning (~32k tokens)",
};

const COMMAND_REMAP_AUTO_VALUE = "__auto__";

export interface CommandRemapCandidate {
	target: string;
	label: string;
	description?: string;
}

export interface CommandRemapEntry {
	command: string;
	currentTarget?: string;
	activeTarget?: string;
	candidates: CommandRemapCandidate[];
}

export interface ShortcutRemapCandidate {
	target: string;
	label: string;
	description?: string;
}

export interface ShortcutRemapEntry {
	shortcut: string;
	currentTarget?: string;
	activeTarget?: string;
	candidates: ShortcutRemapCandidate[];
}

export interface CommandTargetOption {
	value: string;
	label: string;
	description?: string;
}

export interface VirtualCommandMappingEntry {
	alias: string;
	targetCommand: string;
}

export interface VirtualShortcutMappingEntry {
	shortcut: string;
	targetCommand: string;
}

function formatCommandRemapSummary(entries: CommandRemapEntry[]): string {
	if (entries.length === 0) {
		return "no conflicts";
	}
	const mappedCount = entries.filter((entry) => entry.currentTarget !== undefined).length;
	return `${mappedCount}/${entries.length} mapped`;
}

function formatShortcutRemapSummary(entries: ShortcutRemapEntry[]): string {
	if (entries.length === 0) {
		return "no conflicts";
	}
	const mappedCount = entries.filter((entry) => entry.currentTarget !== undefined).length;
	return `${mappedCount}/${entries.length} mapped`;
}

function formatRemapSummary(commandEntries: CommandRemapEntry[], shortcutEntries: ShortcutRemapEntry[]): string {
	const total = commandEntries.length + shortcutEntries.length;
	if (total === 0) {
		return "no conflicts";
	}
	const mapped =
		commandEntries.filter((entry) => entry.currentTarget !== undefined).length +
		shortcutEntries.filter((entry) => entry.currentTarget !== undefined).length;
	return `${mapped}/${total} mapped`;
}

function formatVirtualCommandSummary(entries: VirtualCommandMappingEntry[]): string {
	return entries.length === 0 ? "none" : String(entries.length);
}

function formatVirtualShortcutSummary(entries: VirtualShortcutMappingEntry[]): string {
	return entries.length === 0 ? "none" : String(entries.length);
}

function resolveTargetLabel(targetCommand: string, commandTargets: CommandTargetOption[]): string {
	return commandTargets.find((target) => target.value === targetCommand)?.label ?? `/${targetCommand}`;
}

export interface SettingsConfig {
	autoCompact: boolean;
	showImages: boolean;
	autoResizeImages: boolean;
	blockImages: boolean;
	enableSkillCommands: boolean;
	steeringMode: "all" | "one-at-a-time";
	followUpMode: "all" | "one-at-a-time";
	transport: Transport;
	thinkingLevel: ThinkingLevel;
	availableThinkingLevels: ThinkingLevel[];
	currentTheme: string;
	availableThemes: string[];
	hideThinkingBlock: boolean;
	collapseChangelog: boolean;
	enableInstallTelemetry: boolean;
	doubleEscapeAction: "fork" | "tree" | "none";
	treeFilterMode: "default" | "no-tools" | "user-only" | "labeled-only" | "all";
	showHardwareCursor: boolean;
	editorPaddingX: number;
	autocompleteMaxVisible: number;
	quietStartup: boolean;
	clearOnShrink: boolean;
	commandRemapEntries: CommandRemapEntry[];
	shortcutRemapEntries: ShortcutRemapEntry[];
	virtualCommandMappings: VirtualCommandMappingEntry[];
	virtualShortcutMappings: VirtualShortcutMappingEntry[];
	commandTargets: CommandTargetOption[];
}

export interface SettingsCallbacks {
	onAutoCompactChange: (enabled: boolean) => void;
	onShowImagesChange: (enabled: boolean) => void;
	onAutoResizeImagesChange: (enabled: boolean) => void;
	onBlockImagesChange: (blocked: boolean) => void;
	onEnableSkillCommandsChange: (enabled: boolean) => void;
	onSteeringModeChange: (mode: "all" | "one-at-a-time") => void;
	onFollowUpModeChange: (mode: "all" | "one-at-a-time") => void;
	onTransportChange: (transport: Transport) => void;
	onThinkingLevelChange: (level: ThinkingLevel) => void;
	onThemeChange: (theme: string) => void;
	onThemePreview?: (theme: string) => void;
	onHideThinkingBlockChange: (hidden: boolean) => void;
	onCollapseChangelogChange: (collapsed: boolean) => void;
	onEnableInstallTelemetryChange: (enabled: boolean) => void;
	onDoubleEscapeActionChange: (action: "fork" | "tree" | "none") => void;
	onTreeFilterModeChange: (mode: "default" | "no-tools" | "user-only" | "labeled-only" | "all") => void;
	onShowHardwareCursorChange: (enabled: boolean) => void;
	onEditorPaddingXChange: (padding: number) => void;
	onAutocompleteMaxVisibleChange: (maxVisible: number) => void;
	onQuietStartupChange: (enabled: boolean) => void;
	onClearOnShrinkChange: (enabled: boolean) => void;
	onCommandRemapChange: (command: string, target: string | undefined) => void;
	onShortcutRemapChange: (shortcut: string, target: string | undefined) => void;
	onSetVirtualCommand: (alias: string, targetCommand: string | undefined) => void;
	onSetVirtualShortcut: (shortcut: string, targetCommand: string | undefined) => void;
	onCancel: () => void;
}

/**
 * A submenu component for selecting from a list of options.
 */
class SelectSubmenu extends Container {
	private selectList: SelectList;

	constructor(
		title: string,
		description: string,
		options: SelectItem[],
		currentValue: string,
		onSelect: (value: string) => void,
		onCancel: () => void,
		onSelectionChange?: (value: string) => void,
	) {
		super();

		// Title
		this.addChild(new Text(theme.bold(theme.fg("accent", title)), 0, 0));

		// Description
		if (description) {
			this.addChild(new Spacer(1));
			this.addChild(new Text(theme.fg("muted", description), 0, 0));
		}

		// Spacer
		this.addChild(new Spacer(1));

		// Select list
		this.selectList = new SelectList(
			options,
			Math.min(options.length, 10),
			getSelectListTheme(),
			SETTINGS_SUBMENU_SELECT_LIST_LAYOUT,
		);

		// Pre-select current value
		const currentIndex = options.findIndex((o) => o.value === currentValue);
		if (currentIndex !== -1) {
			this.selectList.setSelectedIndex(currentIndex);
		}

		this.selectList.onSelect = (item) => {
			onSelect(item.value);
		};

		this.selectList.onCancel = onCancel;

		if (onSelectionChange) {
			this.selectList.onSelectionChange = (item) => {
				onSelectionChange(item.value);
			};
		}

		this.addChild(this.selectList);

		// Hint
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("dim", "  Enter to select · Esc to go back"), 0, 0));
	}

	handleInput(data: string): void {
		this.selectList.handleInput(data);
	}
}

class CommandRemapSubmenu extends Container {
	private settingsList: SettingsList;

	constructor(
		entries: CommandRemapEntry[],
		onRemapChange: (command: string, target: string | undefined) => void,
		onDone: () => void,
	) {
		super();

		this.addChild(new Text(theme.bold(theme.fg("accent", "Command Remaps")), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(
			new Text(theme.fg("muted", "Assign duplicate extension commands to a preferred extension target."), 0),
		);
		this.addChild(new Spacer(1));

		const items: SettingItem[] = entries.map((entry) => ({
			id: entry.command,
			label: `/${entry.command}`,
			description: `${entry.candidates.length} extension target${entry.candidates.length === 1 ? "" : "s"}`,
			currentValue: this.getCurrentValueLabel(entry),
			submenu: (_currentValue, done) => {
				return new SelectSubmenu(
					`Remap /${entry.command}`,
					"Choose which extension should handle this command.",
					[
						{
							value: COMMAND_REMAP_AUTO_VALUE,
							label: `${entry.activeTarget === undefined ? "* " : "  "}Auto (no remap)`,
							description: "Use default command suffix behavior",
						},
						...entry.candidates.map((candidate) => ({
							value: candidate.target,
							label: `${entry.activeTarget === candidate.target ? "* " : "  "}${candidate.label}`,
							description: candidate.description,
						})),
					],
					entry.currentTarget ?? COMMAND_REMAP_AUTO_VALUE,
					(selected) => {
						if (selected === COMMAND_REMAP_AUTO_VALUE) {
							entry.currentTarget = undefined;
							entry.activeTarget = undefined;
							onRemapChange(entry.command, undefined);
						} else {
							entry.currentTarget = selected;
							entry.activeTarget = selected;
							onRemapChange(entry.command, selected);
						}
						done(this.getCurrentValueLabel(entry));
					},
					() => done(),
				);
			},
		}));

		this.settingsList = new SettingsList(items, 10, getSettingsListTheme(), () => {}, onDone, { enableSearch: true });
		this.addChild(this.settingsList);
	}

	private getCurrentValueLabel(entry: CommandRemapEntry): string {
		if (!entry.currentTarget) {
			return "auto";
		}
		const selectedCandidate = entry.candidates.find((candidate) => candidate.target === entry.currentTarget);
		return selectedCandidate?.label ?? entry.currentTarget;
	}

	handleInput(data: string): void {
		this.settingsList.handleInput(data);
	}
}

class ShortcutRemapSubmenu extends Container {
	private settingsList: SettingsList;

	constructor(
		entries: ShortcutRemapEntry[],
		onRemapChange: (shortcut: string, target: string | undefined) => void,
		onDone: () => void,
	) {
		super();

		this.addChild(new Text(theme.bold(theme.fg("accent", "Shortcut Remaps")), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(
			new Text(theme.fg("muted", "Assign duplicate extension shortcuts to a preferred extension target."), 0),
		);
		this.addChild(new Spacer(1));

		const items: SettingItem[] = entries.map((entry) => ({
			id: entry.shortcut,
			label: entry.shortcut,
			description: `${entry.candidates.length} extension target${entry.candidates.length === 1 ? "" : "s"}`,
			currentValue: this.getCurrentValueLabel(entry),
			submenu: (_currentValue, done) => {
				return new SelectSubmenu(
					`Remap ${entry.shortcut}`,
					"Choose which extension should handle this shortcut.",
					[
						{
							value: COMMAND_REMAP_AUTO_VALUE,
							label: `${entry.activeTarget === undefined ? "* " : "  "}Auto (no remap)`,
							description: "Use default shortcut precedence behavior",
						},
						...entry.candidates.map((candidate) => ({
							value: candidate.target,
							label: `${entry.activeTarget === candidate.target ? "* " : "  "}${candidate.label}`,
							description: candidate.description,
						})),
					],
					entry.currentTarget ?? COMMAND_REMAP_AUTO_VALUE,
					(selected) => {
						if (selected === COMMAND_REMAP_AUTO_VALUE) {
							entry.currentTarget = undefined;
							entry.activeTarget = undefined;
							onRemapChange(entry.shortcut, undefined);
						} else {
							entry.currentTarget = selected;
							entry.activeTarget = selected;
							onRemapChange(entry.shortcut, selected);
						}
						done(this.getCurrentValueLabel(entry));
					},
					() => done(),
				);
			},
		}));

		this.settingsList = new SettingsList(items, 10, getSettingsListTheme(), () => {}, onDone, { enableSearch: true });
		this.addChild(this.settingsList);
	}

	private getCurrentValueLabel(entry: ShortcutRemapEntry): string {
		if (!entry.currentTarget) {
			return "auto";
		}
		const selectedCandidate = entry.candidates.find((candidate) => candidate.target === entry.currentTarget);
		return selectedCandidate?.label ?? entry.currentTarget;
	}

	handleInput(data: string): void {
		this.settingsList.handleInput(data);
	}
}

class AddVirtualMappingSubmenu extends Container {
	private keyInput: Input;
	private selectList: SelectList;
	private step: "key" | "target" = "key";
	private enteredKey = "";
	private titleText: Text;
	private descriptionText: Text;
	private keyLabel: string;
	private keyDescription: string;
	private targetDescription: string;
	private normalizeKey: (value: string) => string | undefined;
	private onSubmit: (key: string, targetCommand: string) => void;
	private onDone: () => void;

	constructor(options: {
		title: string;
		keyLabel: string;
		keyDescription: string;
		targetDescription: string;
		targets: CommandTargetOption[];
		normalizeKey: (value: string) => string | undefined;
		onSubmit: (key: string, targetCommand: string) => void;
		onDone: () => void;
	}) {
		super();

		this.keyLabel = options.keyLabel;
		this.keyDescription = options.keyDescription;
		this.targetDescription = options.targetDescription;
		this.normalizeKey = options.normalizeKey;
		this.onSubmit = options.onSubmit;
		this.onDone = options.onDone;
		this.titleText = new Text(theme.bold(theme.fg("accent", options.title)), 0, 0);
		this.descriptionText = new Text(theme.fg("muted", options.keyDescription), 0, 0);
		this.keyInput = new Input();

		const targetOptions: SelectItem[] = options.targets.map((target) => ({
			value: target.value,
			label: target.label,
			description: target.description,
		}));
		this.selectList = new SelectList(targetOptions, 10, getSelectListTheme(), SETTINGS_SUBMENU_SELECT_LIST_LAYOUT);
		this.selectList.onSelect = (item) => {
			this.onSubmit(this.enteredKey, item.value);
			this.onDone();
		};
		this.selectList.onCancel = this.onDone;

		this.renderKeyStep();
	}

	private renderKeyStep(): void {
		this.clear();
		this.addChild(this.titleText);
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("muted", this.keyLabel), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(this.keyInput);
		this.addChild(new Spacer(1));
		this.addChild(this.descriptionText);
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("dim", "  Enter to continue · Esc to cancel"), 0, 0));
	}

	private renderTargetStep(): void {
		this.clear();
		this.addChild(this.titleText);
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("muted", `${this.keyLabel}: ${this.enteredKey}`), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("muted", this.targetDescription), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(this.selectList);
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("dim", "  Enter to save · Esc to cancel"), 0, 0));
	}

	handleInput(data: string): void {
		const kb = getKeybindings();
		if (this.step === "key") {
			if (kb.matches(data, "tui.select.cancel")) {
				this.onDone();
				return;
			}
			if (kb.matches(data, "tui.select.confirm") || data === "\n") {
				const normalized = this.normalizeKey(this.keyInput.getValue());
				if (!normalized) {
					this.descriptionText.setText(theme.fg("warning", this.keyDescription));
					return;
				}
				this.enteredKey = normalized;
				this.step = "target";
				this.renderTargetStep();
				return;
			}
			this.keyInput.handleInput(data);
			return;
		}

		this.selectList.handleInput(data);
	}
}

const REMOVE_MAPPING_VALUE = "__remove_mapping__";

class VirtualCommandMappingsSubmenu extends Container {
	private settingsList: SettingsList;
	private entries: VirtualCommandMappingEntry[];
	private commandTargets: CommandTargetOption[];
	private onSetVirtualCommand: (alias: string, targetCommand: string | undefined) => void;
	private onDone: () => void;

	constructor(
		entries: VirtualCommandMappingEntry[],
		commandTargets: CommandTargetOption[],
		onSetVirtualCommand: (alias: string, targetCommand: string | undefined) => void,
		onDone: () => void,
	) {
		super();
		this.entries = entries;
		this.commandTargets = commandTargets;
		this.onSetVirtualCommand = onSetVirtualCommand;
		this.onDone = onDone;
		this.settingsList = new SettingsList([], 10, getSettingsListTheme(), () => {}, onDone, { enableSearch: true });
		this.renderContent();
	}

	private renderContent(): void {
		this.clear();
		this.addChild(new Text(theme.bold(theme.fg("accent", "Virtual Commands")), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("muted", "Edit or remove virtual slash command aliases."), 0, 0));
		this.addChild(new Spacer(1));

		const items: SettingItem[] = this.entries
			.slice()
			.sort((a, b) => a.alias.localeCompare(b.alias))
			.map((entry) => ({
				id: entry.alias,
				label: entry.alias,
				description: "Select a target command or remove this mapping",
				currentValue: resolveTargetLabel(entry.targetCommand, this.commandTargets),
				submenu: (_currentValue, done) =>
					new SelectSubmenu(
						`Edit ${entry.alias}`,
						"Choose target command or remove mapping.",
						[
							...this.commandTargets.map((target) => ({
								value: target.value,
								label: target.label,
								description: target.description,
							})),
							{ value: REMOVE_MAPPING_VALUE, label: "Remove mapping" },
						],
						entry.targetCommand,
						(selected) => {
							if (selected === REMOVE_MAPPING_VALUE) {
								this.onSetVirtualCommand(entry.alias, undefined);
								this.entries = this.entries.filter((item) => item.alias !== entry.alias);
								done("removed");
								this.renderContent();
								return;
							}
							entry.targetCommand = selected;
							this.onSetVirtualCommand(entry.alias, selected);
							done(resolveTargetLabel(selected, this.commandTargets));
						},
						() => done(),
					),
			}));

		this.settingsList = new SettingsList(items, 10, getSettingsListTheme(), () => {}, this.onDone, {
			enableSearch: true,
		});
		this.addChild(this.settingsList);
	}

	handleInput(data: string): void {
		this.settingsList.handleInput(data);
	}
}

class VirtualShortcutMappingsSubmenu extends Container {
	private settingsList: SettingsList;
	private entries: VirtualShortcutMappingEntry[];
	private commandTargets: CommandTargetOption[];
	private onSetVirtualShortcut: (shortcut: string, targetCommand: string | undefined) => void;
	private onDone: () => void;

	constructor(
		entries: VirtualShortcutMappingEntry[],
		commandTargets: CommandTargetOption[],
		onSetVirtualShortcut: (shortcut: string, targetCommand: string | undefined) => void,
		onDone: () => void,
	) {
		super();
		this.entries = entries;
		this.commandTargets = commandTargets;
		this.onSetVirtualShortcut = onSetVirtualShortcut;
		this.onDone = onDone;
		this.settingsList = new SettingsList([], 10, getSettingsListTheme(), () => {}, onDone, { enableSearch: true });
		this.renderContent();
	}

	private renderContent(): void {
		this.clear();
		this.addChild(new Text(theme.bold(theme.fg("accent", "Virtual Keybinds")), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("muted", "Edit or remove virtual shortcut mappings."), 0, 0));
		this.addChild(new Spacer(1));

		const items: SettingItem[] = this.entries
			.slice()
			.sort((a, b) => a.shortcut.localeCompare(b.shortcut))
			.map((entry) => ({
				id: entry.shortcut,
				label: entry.shortcut,
				description: "Select a target command or remove this mapping",
				currentValue: resolveTargetLabel(entry.targetCommand, this.commandTargets),
				submenu: (_currentValue, done) =>
					new SelectSubmenu(
						`Edit ${entry.shortcut}`,
						"Choose target command or remove mapping.",
						[
							...this.commandTargets.map((target) => ({
								value: target.value,
								label: target.label,
								description: target.description,
							})),
							{ value: REMOVE_MAPPING_VALUE, label: "Remove mapping" },
						],
						entry.targetCommand,
						(selected) => {
							if (selected === REMOVE_MAPPING_VALUE) {
								this.onSetVirtualShortcut(entry.shortcut, undefined);
								this.entries = this.entries.filter((item) => item.shortcut !== entry.shortcut);
								done("removed");
								this.renderContent();
								return;
							}
							entry.targetCommand = selected;
							this.onSetVirtualShortcut(entry.shortcut, selected);
							done(resolveTargetLabel(selected, this.commandTargets));
						},
						() => done(),
					),
			}));

		this.settingsList = new SettingsList(items, 10, getSettingsListTheme(), () => {}, this.onDone, {
			enableSearch: true,
		});
		this.addChild(this.settingsList);
	}

	handleInput(data: string): void {
		this.settingsList.handleInput(data);
	}
}

class RemapsSubmenu extends Container {
	private settingsList: SettingsList;

	constructor(
		commandEntries: CommandRemapEntry[],
		shortcutEntries: ShortcutRemapEntry[],
		virtualCommandMappings: VirtualCommandMappingEntry[],
		virtualShortcutMappings: VirtualShortcutMappingEntry[],
		commandTargets: CommandTargetOption[],
		callbacks: {
			onCommandRemapChange: (command: string, target: string | undefined) => void;
			onShortcutRemapChange: (shortcut: string, target: string | undefined) => void;
			onSetVirtualCommand: (alias: string, targetCommand: string | undefined) => void;
			onSetVirtualShortcut: (shortcut: string, targetCommand: string | undefined) => void;
		},
		onDone: () => void,
	) {
		super();

		this.addChild(new Text(theme.bold(theme.fg("accent", "Remaps")), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(
			new Text(theme.fg("muted", "Configure explicit extension routing for command/shortcut conflicts."), 0),
		);
		this.addChild(new Spacer(1));

		const items: SettingItem[] = [
			{
				id: "command-remaps",
				label: "Commands",
				description: "Route duplicate slash commands to a preferred extension",
				currentValue: formatCommandRemapSummary(commandEntries),
				submenu: (_currentValue, done) =>
					new CommandRemapSubmenu(commandEntries, callbacks.onCommandRemapChange, () => {
						done(formatCommandRemapSummary(commandEntries));
					}),
			},
			{
				id: "shortcut-remaps",
				label: "Keybinds",
				description: "Route duplicate extension shortcuts to a preferred extension",
				currentValue: formatShortcutRemapSummary(shortcutEntries),
				submenu: (_currentValue, done) =>
					new ShortcutRemapSubmenu(shortcutEntries, callbacks.onShortcutRemapChange, () => {
						done(formatShortcutRemapSummary(shortcutEntries));
					}),
			},
			{
				id: "virtual-commands",
				label: "Virtual commands",
				description: "Edit or remove existing virtual slash command aliases",
				currentValue: formatVirtualCommandSummary(virtualCommandMappings),
				submenu: (_currentValue, done) =>
					new VirtualCommandMappingsSubmenu(
						virtualCommandMappings,
						commandTargets,
						callbacks.onSetVirtualCommand,
						() => done(formatVirtualCommandSummary(virtualCommandMappings)),
					),
			},
			{
				id: "virtual-shortcuts",
				label: "Virtual keybinds",
				description: "Edit or remove existing virtual shortcut mappings",
				currentValue: formatVirtualShortcutSummary(virtualShortcutMappings),
				submenu: (_currentValue, done) =>
					new VirtualShortcutMappingsSubmenu(
						virtualShortcutMappings,
						commandTargets,
						callbacks.onSetVirtualShortcut,
						() => done(formatVirtualShortcutSummary(virtualShortcutMappings)),
					),
			},
			{
				id: "add-virtual-command",
				label: "+ Add vcommand",
				description: "Create a virtual slash command alias for any existing extension command",
				currentValue: "",
				submenu: (_currentValue, done) =>
					new AddVirtualMappingSubmenu({
						title: "Add Virtual Command",
						keyLabel: "Alias command (e.g. /mycommand)",
						keyDescription: "Enter a slash command alias.",
						targetDescription: "Choose target command",
						targets: commandTargets,
						normalizeKey: (value) => {
							const trimmed = value.trim();
							if (!trimmed) return undefined;
							const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
							if (normalized.length <= 1) return undefined;
							return normalized;
						},
						onSubmit: (alias, targetCommand) => callbacks.onSetVirtualCommand(alias, targetCommand),
						onDone: done,
					}),
			},
			{
				id: "add-virtual-shortcut",
				label: "+ Add vshortcut",
				description: "Create a virtual shortcut that triggers an extension command",
				currentValue: "",
				submenu: (_currentValue, done) =>
					new AddVirtualMappingSubmenu({
						title: "Add Virtual Shortcut",
						keyLabel: "Shortcut (e.g. ctrl+k)",
						keyDescription: "Enter a keybinding in canonical format.",
						targetDescription: "Choose target command",
						targets: commandTargets,
						normalizeKey: (value) => {
							const normalized = value.trim().toLowerCase();
							return normalized.length > 0 ? normalized : undefined;
						},
						onSubmit: (shortcut, targetCommand) => callbacks.onSetVirtualShortcut(shortcut, targetCommand),
						onDone: done,
					}),
			},
		];

		this.settingsList = new SettingsList(items, 8, getSettingsListTheme(), () => {}, onDone, { enableSearch: true });
		this.addChild(this.settingsList);
	}

	handleInput(data: string): void {
		this.settingsList.handleInput(data);
	}
}

/**
 * Main settings selector component.
 */
export class SettingsSelectorComponent extends Container {
	private settingsList: SettingsList;

	constructor(config: SettingsConfig, callbacks: SettingsCallbacks) {
		super();

		const supportsImages = getCapabilities().images;

		const items: SettingItem[] = [
			{
				id: "autocompact",
				label: "Auto-compact",
				description: "Automatically compact context when it gets too large",
				currentValue: config.autoCompact ? "true" : "false",
				values: ["true", "false"],
			},
			{
				id: "steering-mode",
				label: "Steering mode",
				description:
					"Enter while streaming queues steering messages. 'one-at-a-time': deliver one, wait for response. 'all': deliver all at once.",
				currentValue: config.steeringMode,
				values: ["one-at-a-time", "all"],
			},
			{
				id: "follow-up-mode",
				label: "Follow-up mode",
				description:
					"Alt+Enter queues follow-up messages until agent stops. 'one-at-a-time': deliver one, wait for response. 'all': deliver all at once.",
				currentValue: config.followUpMode,
				values: ["one-at-a-time", "all"],
			},
			{
				id: "transport",
				label: "Transport",
				description: "Preferred transport for providers that support multiple transports",
				currentValue: config.transport,
				values: ["sse", "websocket", "auto"],
			},
			{
				id: "hide-thinking",
				label: "Hide thinking",
				description: "Hide thinking blocks in assistant responses",
				currentValue: config.hideThinkingBlock ? "true" : "false",
				values: ["true", "false"],
			},
			{
				id: "collapse-changelog",
				label: "Collapse changelog",
				description: "Show condensed changelog after updates",
				currentValue: config.collapseChangelog ? "true" : "false",
				values: ["true", "false"],
			},
			{
				id: "quiet-startup",
				label: "Quiet startup",
				description: "Disable verbose printing at startup",
				currentValue: config.quietStartup ? "true" : "false",
				values: ["true", "false"],
			},
			{
				id: "install-telemetry",
				label: "Install telemetry",
				description: "Send an anonymous version/update ping after changelog-detected updates",
				currentValue: config.enableInstallTelemetry ? "true" : "false",
				values: ["true", "false"],
			},
			{
				id: "double-escape-action",
				label: "Double-escape action",
				description: "Action when pressing Escape twice with empty editor",
				currentValue: config.doubleEscapeAction,
				values: ["tree", "fork", "none"],
			},
			{
				id: "tree-filter-mode",
				label: "Tree filter mode",
				description: "Default filter when opening /tree",
				currentValue: config.treeFilterMode,
				values: ["default", "no-tools", "user-only", "labeled-only", "all"],
			},
			{
				id: "thinking",
				label: "Thinking level",
				description: "Reasoning depth for thinking-capable models",
				currentValue: config.thinkingLevel,
				submenu: (currentValue, done) =>
					new SelectSubmenu(
						"Thinking Level",
						"Select reasoning depth for thinking-capable models",
						config.availableThinkingLevels.map((level) => ({
							value: level,
							label: level,
							description: THINKING_DESCRIPTIONS[level],
						})),
						currentValue,
						(value) => {
							callbacks.onThinkingLevelChange(value as ThinkingLevel);
							done(value);
						},
						() => done(),
					),
			},
			{
				id: "theme",
				label: "Theme",
				description: "Color theme for the interface",
				currentValue: config.currentTheme,
				submenu: (currentValue, done) =>
					new SelectSubmenu(
						"Theme",
						"Select color theme",
						config.availableThemes.map((t) => ({
							value: t,
							label: t,
						})),
						currentValue,
						(value) => {
							callbacks.onThemeChange(value);
							done(value);
						},
						() => {
							// Restore original theme on cancel
							callbacks.onThemePreview?.(currentValue);
							done();
						},
						(value) => {
							// Preview theme on selection change
							callbacks.onThemePreview?.(value);
						},
					),
			},
		];

		// Only show image toggle if terminal supports it
		if (supportsImages) {
			// Insert after autocompact
			items.splice(1, 0, {
				id: "show-images",
				label: "Show images",
				description: "Render images inline in terminal",
				currentValue: config.showImages ? "true" : "false",
				values: ["true", "false"],
			});
		}

		// Image auto-resize toggle (always available, affects both attached and read images)
		items.splice(supportsImages ? 2 : 1, 0, {
			id: "auto-resize-images",
			label: "Auto-resize images",
			description: "Resize large images to 2000x2000 max for better model compatibility",
			currentValue: config.autoResizeImages ? "true" : "false",
			values: ["true", "false"],
		});

		// Block images toggle (always available, insert after auto-resize-images)
		const autoResizeIndex = items.findIndex((item) => item.id === "auto-resize-images");
		items.splice(autoResizeIndex + 1, 0, {
			id: "block-images",
			label: "Block images",
			description: "Prevent images from being sent to LLM providers",
			currentValue: config.blockImages ? "true" : "false",
			values: ["true", "false"],
		});

		// Skill commands toggle (insert after block-images)
		const blockImagesIndex = items.findIndex((item) => item.id === "block-images");
		items.splice(blockImagesIndex + 1, 0, {
			id: "skill-commands",
			label: "Skill commands",
			description: "Register skills as /skill:name commands",
			currentValue: config.enableSkillCommands ? "true" : "false",
			values: ["true", "false"],
		});

		// Remaps submenu (insert after skill-commands)
		const skillCommandsIndex = items.findIndex((item) => item.id === "skill-commands");
		items.splice(skillCommandsIndex + 1, 0, {
			id: "remaps",
			label: "Remaps",
			description: "Configure command and keybind remaps for extension conflicts",
			currentValue: formatRemapSummary(config.commandRemapEntries, config.shortcutRemapEntries),
			submenu: (_currentValue, done) =>
				new RemapsSubmenu(
					config.commandRemapEntries,
					config.shortcutRemapEntries,
					config.virtualCommandMappings,
					config.virtualShortcutMappings,
					config.commandTargets,
					{
						onCommandRemapChange: callbacks.onCommandRemapChange,
						onShortcutRemapChange: callbacks.onShortcutRemapChange,
						onSetVirtualCommand: callbacks.onSetVirtualCommand,
						onSetVirtualShortcut: callbacks.onSetVirtualShortcut,
					},
					() => done(formatRemapSummary(config.commandRemapEntries, config.shortcutRemapEntries)),
				),
		});

		// Hardware cursor toggle (insert after remaps)
		const remapIndex = items.findIndex((item) => item.id === "remaps");
		items.splice(remapIndex + 1, 0, {
			id: "show-hardware-cursor",
			label: "Show hardware cursor",
			description: "Show the terminal cursor while still positioning it for IME support",
			currentValue: config.showHardwareCursor ? "true" : "false",
			values: ["true", "false"],
		});

		// Editor padding toggle (insert after show-hardware-cursor)
		const hardwareCursorIndex = items.findIndex((item) => item.id === "show-hardware-cursor");
		items.splice(hardwareCursorIndex + 1, 0, {
			id: "editor-padding",
			label: "Editor padding",
			description: "Horizontal padding for input editor (0-3)",
			currentValue: String(config.editorPaddingX),
			values: ["0", "1", "2", "3"],
		});

		// Autocomplete max visible toggle (insert after editor-padding)
		const editorPaddingIndex = items.findIndex((item) => item.id === "editor-padding");
		items.splice(editorPaddingIndex + 1, 0, {
			id: "autocomplete-max-visible",
			label: "Autocomplete max items",
			description: "Max visible items in autocomplete dropdown (3-20)",
			currentValue: String(config.autocompleteMaxVisible),
			values: ["3", "5", "7", "10", "15", "20"],
		});

		// Clear on shrink toggle (insert after autocomplete-max-visible)
		const autocompleteIndex = items.findIndex((item) => item.id === "autocomplete-max-visible");
		items.splice(autocompleteIndex + 1, 0, {
			id: "clear-on-shrink",
			label: "Clear on shrink",
			description: "Clear empty rows when content shrinks (may cause flicker)",
			currentValue: config.clearOnShrink ? "true" : "false",
			values: ["true", "false"],
		});

		// Add borders
		this.addChild(new DynamicBorder());

		this.settingsList = new SettingsList(
			items,
			10,
			getSettingsListTheme(),
			(id, newValue) => {
				switch (id) {
					case "autocompact":
						callbacks.onAutoCompactChange(newValue === "true");
						break;
					case "show-images":
						callbacks.onShowImagesChange(newValue === "true");
						break;
					case "auto-resize-images":
						callbacks.onAutoResizeImagesChange(newValue === "true");
						break;
					case "block-images":
						callbacks.onBlockImagesChange(newValue === "true");
						break;
					case "skill-commands":
						callbacks.onEnableSkillCommandsChange(newValue === "true");
						break;
					case "steering-mode":
						callbacks.onSteeringModeChange(newValue as "all" | "one-at-a-time");
						break;
					case "follow-up-mode":
						callbacks.onFollowUpModeChange(newValue as "all" | "one-at-a-time");
						break;
					case "transport":
						callbacks.onTransportChange(newValue as Transport);
						break;
					case "hide-thinking":
						callbacks.onHideThinkingBlockChange(newValue === "true");
						break;
					case "collapse-changelog":
						callbacks.onCollapseChangelogChange(newValue === "true");
						break;
					case "quiet-startup":
						callbacks.onQuietStartupChange(newValue === "true");
						break;
					case "install-telemetry":
						callbacks.onEnableInstallTelemetryChange(newValue === "true");
						break;
					case "double-escape-action":
						callbacks.onDoubleEscapeActionChange(newValue as "fork" | "tree");
						break;
					case "tree-filter-mode":
						callbacks.onTreeFilterModeChange(
							newValue as "default" | "no-tools" | "user-only" | "labeled-only" | "all",
						);
						break;
					case "show-hardware-cursor":
						callbacks.onShowHardwareCursorChange(newValue === "true");
						break;
					case "editor-padding":
						callbacks.onEditorPaddingXChange(parseInt(newValue, 10));
						break;
					case "autocomplete-max-visible":
						callbacks.onAutocompleteMaxVisibleChange(parseInt(newValue, 10));
						break;
					case "clear-on-shrink":
						callbacks.onClearOnShrinkChange(newValue === "true");
						break;
				}
			},
			callbacks.onCancel,
			{ enableSearch: true },
		);

		this.addChild(this.settingsList);
		this.addChild(new DynamicBorder());
	}

	getSettingsList(): SettingsList {
		return this.settingsList;
	}
}
