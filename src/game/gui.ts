/// <reference path="../yendor/yendor.ts" />
/*
	Section: GUI
*/
module Game {
	"use strict";

	/********************************************************************************
	 * Group: generic GUI stuff
	 ********************************************************************************/
	export class Gui extends Yendor.Position {
		private static activeModal: Gui;

		private _width: number;
		private _height: number
		protected __console: Yendor.Console;
		private _visible: boolean = false;
		private modal: boolean = false;

		static getActiveModal(): Gui { return Gui.activeModal; }

		constructor(_width: number, _height: number) {
			super();
			this._width = _width;
			this._height = _height;
			this.__console = new Yendor.Console(_width, _height );
		}

		get width() { return this._width; }
		get height() { return this._height; }

		isVisible() {return this._visible; }
		isModal() { return this.modal; }
		protected setModal() { this.modal = true; }
		set visible(newValue: boolean) { this._visible = newValue; }
		show() {
			if ( this.modal ) {
				if ( Gui.activeModal ) {
					Gui.activeModal.hide();
				}
				Gui.activeModal = this;
			}
			this._visible = true;
		}
		hide() {
			if ( this.modal ) {
				Gui.activeModal = undefined;
			}
			this._visible = false;
		}

		get console() { return this.__console; }

		clear() {}

		/*
			Function: render
			To be overloaded by extending classes.
		*/
		render(map: Map, actorManager: ActorManager, destination: Yendor.Console) {
			this.__console.blit(destination, this.x, this.y);
		}
	}

	export interface GuiManager {
		addGui(gui: Gui, name: string, x?: number, y?: number);
		renderGui(rootConsole: Yendor.Console);
	}

	/********************************************************************************
	 * Group: status panel
	 ********************************************************************************/
	export class Message implements Persistent {
		className : string;
		private _color: Yendor.Color;
		private _text: string
		constructor(_color: Yendor.Color, _text: string) {
			this.className = "Message";
			this._color = _color;
			this._text = _text;
		}

		get text() { return this._text; }
		get color() { return this._color; }
		darkenColor() {
			this._color = Yendor.ColorUtils.multiply(this._color, Constants.LOG_DARKEN_COEF);
		}
	}

	export class StatusPanel extends Gui implements EventListener, Persistent {
		private static MESSAGE_X = Constants.STAT_BAR_WIDTH + 2;
		className: string;
		private messageHeight : number;
		private messages: Message[] = [];
		private mouseLookText: string = "";
		constructor(width: number, height: number) {
			super(width, height);
			this.className = "StatusPanel";
			this.messageHeight = height - 1;
			EventBus.getInstance().registerListener(this, EventType.LOG_MESSAGE);
			EventBus.getInstance().registerListener(this, EventType.MOUSE_MOVE);
		}

		processEvent( event: Event<any> ) {
			switch ( event.type ) {
				case EventType.LOG_MESSAGE :
					var msg: Message = event.data;
					this.message( msg.color, msg.text );
				break;
				case EventType.MOUSE_MOVE :
					var pos: Yendor.Position = event.data;
					if ( event.map.isInFov(pos.x, pos.y) ) {
						var actorsOnCell: Actor[] = event.actorManager.findActorsOnCell(pos, event.actorManager.getCreatures());
						actorsOnCell = actorsOnCell.concat(event.actorManager.findActorsOnCell(pos, event.actorManager.getItems()));
						actorsOnCell = actorsOnCell.concat(event.actorManager.findActorsOnCell(pos, event.actorManager.getCorpses()));
						this.handleMouseLook( actorsOnCell );
					}
				break;
			}
		}

		message(color: Yendor.Color, text: string) {
			var lines = text.split("\n");
			if ( this.messages.length + lines.length > this.messageHeight ) {
				this.messages.splice(0, this.messages.length + lines.length - this.messageHeight );
			}
			for ( var i: number = 0; i < this.messages.length; ++i ) {
				this.messages[i].darkenColor();
			}
			for ( var j: number = 0; j < lines.length; ++j ) {
				this.messages.push(new Message(color, lines[j]));
			}
		}

		render(map: Map, actorManager: ActorManager, destination: Yendor.Console) {
			this.console.clearBack("black");
			this.console.clearText();
			var player: Actor = actorManager.getPlayer();
			this.renderBar(1, 1, Constants.STAT_BAR_WIDTH, "HP", player.destructible.hp,
				player.destructible.maxHp, Constants.HEALTH_BAR_BACKGROUND, Constants.HEALTH_BAR_FOREGROUND);
			this.console.print(0, 0, this.mouseLookText);
			this.renderMessages();
			super.render(map, actorManager, destination);
		}

		clear() {
			this.messages = [];
			this.mouseLookText = "";
		}

		private handleMouseLook( actors: Actor[] ) {
			var len: number = actors.length;
			this.mouseLookText = len === 0 ? "" : actors[0].name;
			for ( var i: number = 1; i < len; ++i) {
				var actor: Actor = actors[i];
				this.mouseLookText += "," + actor.name;
			}
		}

		private renderMessages() {
			for ( var i: number = 0; i < this.messages.length; ++i ) {
				var msg: Message = this.messages[i];
				this.console.print(StatusPanel.MESSAGE_X, i + 1, msg.text, msg.color);
			}
		}

		private renderBar(x: number, y: number, width: number, name: string, value: number,
			maxValue: number, foreColor: Yendor.Color, backColor: Yendor.Color) {
			this.console.clearBack(backColor, x, y, width, 1);
			var barWidth = Math.floor(value / maxValue * width);
			if ( barWidth > 0 ) {
				this.console.clearBack(foreColor, x, y, barWidth, 1);
			}
			var label: string = name + " : " + value + "/" + maxValue;
			this.console.print(x + Math.floor(( width - label.length) / 2), y, label);
		}
	}

	/********************************************************************************
	 * Group: inventory
	 ********************************************************************************/
	export class InventoryPanel extends Gui implements EventListener {
		static TITLE: string = "=== inventory - ESC to close ===";
		private actorManager: ActorManager;
		private selectedItem: number;

		constructor(width: number, height: number, actorManager: ActorManager) {
			super(width, height);
			this.setModal();
			this.actorManager = actorManager;
			EventBus.getInstance().registerListener(this, EventType.OPEN_INVENTORY);
		}

		processEvent( event: Event<any> ) {
			if ( event.type === EventType.OPEN_INVENTORY ) {
				this.activate();
			} else if ( event.type === EventType.KEY_PRESSED ) {
				if ( event.data.keyCode === KeyEvent.DOM_VK_ESCAPE ) {
					this.deactivate();
				} else {
					var index = event.data.keyCode - KeyEvent.DOM_VK_A;
					this.useItem(index);
				}
			} else if (event.type === EventType.MOUSE_MOVE) {
				this.selectItemAtPos(event.data);
			} else if (event.type === EventType.MOUSE_CLICK && event.data === MouseButton.LEFT ) {
				if ( this.selectedItem !== undefined ) {
					this.useItem(this.selectedItem);
				}
			}
		}

		private useItem(index: number) {
			var player: Actor = this.actorManager.getPlayer();
			if ( index >= 0 && index < player.container.size() ) {
				var item: Actor = player.container.get(index);
				if (item.pickable) {
					this.hide();
					item.pickable.use(item, player, this.actorManager);
				}
			}
		}

		private activate() {
			this.show();
			EventBus.getInstance().registerListener(this, EventType.KEY_PRESSED);
			EventBus.getInstance().registerListener(this, EventType.MOUSE_MOVE);
			EventBus.getInstance().registerListener(this, EventType.MOUSE_CLICK);
		}

		private deactivate() {
			this.hide();
			EventBus.getInstance().unregisterListener(this, EventType.KEY_PRESSED);
			EventBus.getInstance().unregisterListener(this, EventType.MOUSE_MOVE);
			EventBus.getInstance().unregisterListener(this, EventType.MOUSE_CLICK);
		}

		private selectItemAtPos(pos: Yendor.Position) {
			this.selectedItem = pos.y - (this.y + 1);
			var player: Actor = this.actorManager.getPlayer();
			if ( this.selectedItem < 0 || this.selectedItem > player.container.size() ) {
				this.selectedItem = undefined;
			}
		}

		render(map: Map, actorManager: ActorManager, destination: Yendor.Console) {
			this.console.clearBack(Constants.INVENTORY_BACKGROUND);
			this.console.clearText();
			this.x = Math.floor( destination.width / 2 - this.width / 2 );
			this.y = Math.floor( destination.height / 2 - this.height / 2 );
			var shortcut: number = "a".charCodeAt(0);
			var y: number = 1;
			this.console.print(Math.floor(this.width / 2 - InventoryPanel.TITLE.length / 2), 0, InventoryPanel.TITLE);
			var player: Actor = this.actorManager.getPlayer();
			for ( var i: number = 0; i < player.container.size(); ++i) {
				var item: Actor = player.container.get(i);
				this.console.print(2, y, "(" + String.fromCharCode(shortcut) + ") " + item.name, Constants.INVENTORY_FOREGROUND );
				if (i === this.selectedItem) {
					this.console.clearBack(Constants.INVENTORY_BACKGROUND_ACTIVE, 0, y, -1, 1);
					this.console.clearFore(Constants.INVENTORY_FOREGROUND_ACTIVE, 0, y, -1, 1);
				}
				y++;
				shortcut++;
			}
			super.render(map, actorManager, destination);
		}
	}

	/********************************************************************************
	 * Group: tilePicker
	 ********************************************************************************/

	export interface TilePickerListener {
		(pos: Yendor.Position): void;
	}

	/*
		Class: TilePicker
		A background Gui that sleeps until it receives a PICK_TILE event containing a TilePickerListener.
		It then listens to mouse events until the player left-clicks a tile.
		Then it calls the TilePickerListener with the selected tile position.
	*/
	export class TilePicker extends Gui implements EventListener {
		private tilePos : Yendor.Position;
		private listener: TilePickerListener;
		private tileIsValid: boolean = false;
		private map: Map;
		constructor(map: Map) {
			super(Constants.CONSOLE_WIDTH, Constants.CONSOLE_HEIGHT);
			this.map = map;
			this.setModal();
			EventBus.getInstance().registerListener(this, EventType.PICK_TILE);
		}

		processEvent( event: Event<any> ) {
			if (event.type === EventType.PICK_TILE ) {
				this.activate(event.data);
			} else if (event.type === EventType.MOUSE_MOVE) {
				this.updateMousePosition(event.data);
			} else if (event.type === EventType.MOUSE_CLICK) {
				if ( event.data === MouseButton.LEFT ) {
					if (! this.tileIsValid ) {
						// the tile is not in FOV. do nothing
						return;
					} else if (this.listener) {
						this.listener(this.tilePos);
						EventBus.getInstance().publishEvent(new Event<GameStatus>(EventType.CHANGE_STATUS, GameStatus.NEW_TURN));
					}
				}
				this.deactivate();
			}
		}

		render(map: Map, actorManager: ActorManager, console: Yendor.Console) {
			if ( this.tilePos && console.contains(this.tilePos) ) {
				console.setChar( this.tilePos.x, this.tilePos.y, this.tileIsValid ? "+" : "x" );
				console.fore[this.tilePos.x][this.tilePos.y] = this.tileIsValid ? "green" : "red";
			}
		}

		private activate(listener: TilePickerListener) {
			this.listener = listener;
			EventBus.getInstance().registerListener(this, EventType.MOUSE_MOVE);
			EventBus.getInstance().registerListener(this, EventType.MOUSE_CLICK);
			this.show();
			this.tileIsValid = false;
		}

		private updateMousePosition(mousePos: Yendor.Position) {
			this.tilePos = mousePos;
			this.tileIsValid = this.map.isInFov(this.tilePos.x, this.tilePos.y);
		}

		private deactivate() {
			EventBus.getInstance().unregisterListener(this, EventType.MOUSE_MOVE);
			EventBus.getInstance().unregisterListener(this, EventType.MOUSE_CLICK);
			this.hide();
		}
	}

	/********************************************************************************
	 * Group: menu
	 ********************************************************************************/

	/*
		Interface: MenuItem
		An entry in the menu.
	*/
	export interface MenuItem {
		label: string;
		eventType?: EventType;
		disabled?: boolean;
	}

	/*
		Class: Menu
		A generic popup menu
	*/
	export class Menu extends Gui implements EventListener {
		items: MenuItem[];
		activeItemIndex: number;

		constructor(items: MenuItem[] = [], x: number = -1, y: number = -1) {
			this.items = items;
			var maxWidth = this.computeWidth();
			super(maxWidth, items.length + 2);
			this.setModal();
			this.setPosition(x, y);
		}

		private computeWidth(): number {
			var maxWidth: number = 2;
			for ( var i = 0; i < this.items.length; i++ ) {
				if (maxWidth < this.items[i].label.length + 2) {
					maxWidth = this.items[i].label.length + 2;
				}
			}
			return maxWidth;
		}

		private drawMenu() {
			this.console.clearBack(Constants.MENU_BACKGROUND);
			for ( var j = 0; j < this.items.length; j++ ) {
				var itemx: number = Math.floor(this.width / 2 - this.items[j].label.length / 2);
				this.console.print(itemx, j + 1, this.items[j].label);
			}
		}

		private setPosition(x: number, y: number) {
			if ( x === -1 ) {
				x = Math.floor(Constants.CONSOLE_WIDTH / 2 - this.width / 2);
			}
			if ( y === -1 ) {
				y = Math.floor(Constants.CONSOLE_HEIGHT / 2 - this.height / 2);
			}
			this.moveTo(x, y);
		}

		private resizeConsole() {
			var maxWidth = this.computeWidth();
			if ( this.console.width !== maxWidth || this.console.height !== this.items.length + 2 ) {
				this.__console = new Yendor.Console(maxWidth, this.items.length + 2);
			}
		}

		show() {
			this.resizeConsole();
			this.drawMenu();
			super.show();
			EventBus.getInstance().registerListener(this, EventType.MOUSE_MOVE);
			EventBus.getInstance().registerListener(this, EventType.MOUSE_CLICK);
			EventBus.getInstance().registerListener(this, EventType.KEY_PRESSED);
		}

		hide() {
			super.hide();
			EventBus.getInstance().unregisterListener(this, EventType.MOUSE_MOVE);
			EventBus.getInstance().unregisterListener(this, EventType.MOUSE_CLICK);
			EventBus.getInstance().unregisterListener(this, EventType.KEY_PRESSED);
		}

		render(map: Map, actorManager: ActorManager, destination: Yendor.Console) {
			this.console.clearBack(Constants.MENU_BACKGROUND);
			for ( var i = 0; i < this.items.length; i++ ) {
				if (this.items[i].disabled) {
					this.console.clearFore(Constants.MENU_FOREGROUND_DISABLED, 0, i + 1, -1, 1);
				} else if ( i === this.activeItemIndex ) {
					this.console.clearFore(Constants.MENU_FOREGROUND_ACTIVE, 0, i + 1, -1, 1);
					this.console.clearBack(Constants.MENU_BACKGROUND_ACTIVE, 0, i + 1, -1, 1);
				} else {
					this.console.clearFore(Constants.MENU_FOREGROUND, 0, i + 1, -1, 1);
				}
			}
			super.render(map, actorManager, destination);
		}

		processEvent( event: Event<any> ) {
			if (event.type === EventType.MOUSE_MOVE) {
				this.updateMousePosition(event.data);
			} else if (event.type === EventType.MOUSE_CLICK) {
				if ( event.data === MouseButton.LEFT ) {
					this.handleMouseClick();
				}
			} else if (event.type === EventType.KEY_PRESSED && event.data.keyCode === KeyEvent.DOM_VK_ESCAPE) {
				this.hide();
			}
		}

		private handleMouseClick() {
			if ( this.activeItemIndex !== undefined ) {
				var item: MenuItem = this.items[this.activeItemIndex];
				if (! item.disabled ) {
					this.hide();
					if ( item.eventType ) {
						EventBus.getInstance().publishEvent(new Event<MenuItem>(item.eventType, item));
					}
				}
			} else {
				// close the menu if user clicks out of it
				this.hide();
			}
		}

		private updateMousePosition(mousePos: Yendor.Position) {
			if (mousePos.x >= this.x && mousePos.x < this.x + this.width
				&& mousePos.y >= this.y + 1 && mousePos.y < this.y + this.height - 1) {
				this.activeItemIndex = mousePos.y - this.y - 1;
			} else {
				this.activeItemIndex = undefined;
			}
		}
	}

	export class MainMenu extends Menu {
		constructor() {
			super([
				{label: "Resume game"},
				{label: "New game", eventType: EventType.NEW_GAME}
			]);
		}
	}
}
