;(function() {

var better = {};

if (typeof window === 'object')
	window.better = better;

if (typeof module === 'object')
	module.exports = better;

better.defClass = function defClass() {
	if (arguments.length === 0)
		return function() {};
	
	var prot = arguments[arguments.length-1];
	var constr = prot.constructor || function() {};
	
	if (arguments.length > 1) {
		prot.__proto__ = arguments[0].prototype;
	}
	
	constr.prototype = prot;
	constr.prototype.constructor = constr;
	
	return constr;
};

better.utils = {};

better.utils.titleize = function(text) {
	text = text
		.replace(/([\-\_])/g, ' ')
		.replace(/([0-9]+)/g, ' $1 ')
		.replace(/([A-Z])/g, ' $1')
		.trim()
		.split(/\s+/g);
	
	for (var i=0; i<text.length; i++) {
		var word = text[i].trim();
		if (word.length > 0) {
			word = word.toLowerCase();
			word = word[0].toUpperCase() + word.slice(1);
			text[i] = word;
		}
		else {
			text.splice(i, 1);
			i--;
		}
	}
	
	text = text.join(' ');
	
	return text;
};

better.DataTable = better.defClass({
	view: undefined,
	config: undefined,
	state: undefined,
	items: undefined,
	itemsView: undefined,
	flags: undefined,
	
	constructor: function(container) {
		var view = {};
		this.config = {};
		this.state = {};
		this.items = this.itemsView = [];
		
		this.state.modStack = [];
		this.flags = {
			search: 0,
			sort: 0,
			paging: 0,
			render: 0
		};
		
		this._initView(container);
		this._pushPopFlags('search', 'sort', 'paging', 'render');
	},
	
	_initView: function(container) {
		if (typeof container === 'string')
			container = document.getElementById(container);
		
		var that = this;
		
		var view = {};
		this.view = view;
		
		view.container = container/*.appendChild(document.createElement('div'))*/;
		view.header = view.container.appendChild(document.createElement('div'));
		view.content = view.container.appendChild(document.createElement('div'));
		view.footer = view.container.appendChild(document.createElement('div'));
		
		view.table = view.content.appendChild(document.createElement('table'));
		view.tHead = view.table.appendChild(document.createElement('thead'));
		view.tBody = view.table.appendChild(document.createElement('tbody'));
		
		view.pageSizes = view.header.appendChild(document.createElement('div'));
		
		view.search = view.header.appendChild(document.createElement('div'));
		
		var timer = undefined;
		function doSearch() { that.search.call(that, view.searchInput.value); }
		function setTimer() { unsetTimer(); timer = setTimeout(doSearch, that.config.searchDelay); }
		function unsetTimer() { if (timer !== undefined) clearTimeout(timer); timer = undefined; }
		
		view.searchInput = view.search.appendChild(document.createElement('input'));
		view.searchInput.setAttribute('type', 'text');
		view.searchInput.setAttribute('placeholder', 'Filter');
		view.searchInput.addEventListener('input', setTimer);
		
		view.info = view.footer.appendChild(document.createElement('div'));
		view.pager = view.footer.appendChild(document.createElement('div'));
		
		view.container.setAttribute('class', 'b-datatable');
		view.header.setAttribute('class', 'b-datatable-header');
		view.content.setAttribute('class', 'b-datatable-content');
		view.footer.setAttribute('class', 'b-datatable-footer');
		view.table.setAttribute('class', 'b-datatable-table');
		view.pageSizes.setAttribute('class', 'b-datatable-page-sizes');
		view.search.setAttribute('class', 'b-datatable-search');
		view.info.setAttribute('class', 'b-datatable-info');
		view.pager.setAttribute('class', 'b-datatable-pagenav');
	},
	
	_pushFlags: function() {
		var flags = new Array(arguments.length);
		for (var i=0; i<flags.length; i++)
			flags[i] = arguments[i];
		
		this.state.modStack.push(flags);
	},
	
	_popFlags: function() {
		var stack = this.state.modStack;
		if (stack.length > 0) {
			var flags = stack.pop();
			
			for (var i=0; i<flags.length; i++)
				this.flags[flags[i]]++;
			
			if (stack.length === 0)
				this._invalidate();
		}
	},
	
	_pushPopFlags: function() {
		for (var i=0; i<arguments.length; i++)
			this.flags[arguments[i]]++;
		
		if (this.state.modStack.length === 0)
			this._invalidate();
	},
	
	_invalidate: function() {
		if (!this.state.invalidating) {
			this.state.invalidating = true;
			var flags = this.flags;
			
			/* Useful for performance profiling.
			console.warn('Invalidating');
			console.log('search: '+flags.search + '\n' +
						'sort: '+flags.sort + '\n' +
						'paging: '+flags.paging + '\n' +
						'render: '+flags.render);
			*/
			
			if (flags.search > 0)
				this.searchAgain();
			
			if (flags.sort > 0)
				this.sortAgain();
			
			if (flags.paging > 0)
				this.refreshPage();
			
			if (flags.render > 0)
				this.render();
			
			flags.search = 0;
			flags.sort = 0;
			flags.paging = 0;
			flags.render = 0;
			this.state.modStack = [];
			this.state.invalidating = false;
		}
	},
	
	_setViewVisible: function(view, visible) {
		view.style.display = visible ? '' : 'none';
	},
	_showView: function(view) {
		this._setViewVisible(view, true);
	},
	_hideView: function(view) {
		this._setViewVisible(view, false);
	},
	
	setConfig: function(config) {
		this._pushFlags('search', 'sort', 'paging', 'render');
		
		this.setColumns(config.columns);
		this.setSortable(config.sortable);
		this.setSearchable(config.searchable);
		this.setPaging(config.paging);
		this.config.searchDelay = config.searchDelay || 500;
		
		this._popFlags();
		return this;
	},
	
	setItems: function(items) {
		this.items = items || [];
		this.itemsView = this.items;
		
		this._pushFlags('render');
		this.clearSearch();
		this._popFlags();
		return this;
	},
	
	setColumns: function(columns) {
		if (columns instanceof Array) {
			this.config.columns = [];
			
			function bool(def, val) {
				if (val === undefined) return def;
				else return val ? true : false;
			}
			function func(val) {
				return (typeof val === 'function') ? val : undefined;
			}
			
			for (var i=0; i<columns.length; i++) {
				var column = columns[i];
				if (typeof column === 'object') {
					this.config.columns.push({
						index: this.config.columns.length,
						field: column.field,
						label: column.label,
						searchable: bool(true, column.searchable),
						sortable: bool(undefined, column.sortable),
						render: func(column.render),
						search: func(column.search),
						sort: func(column.sort)
					});
				}
			}
			
			this._pushFlags('render');
			this.clearSearch();
			this._popFlags();
		}
		return this;
	},
	
	setSortable: function(sortable) {
		if (sortable !== undefined)
			sortable = sortable ? true : false;
		
		this.config.sortable = sortable;
		
		if (!sortable)
			this.state.lastSort = undefined;
		
		this._pushPopFlags('render');
		return this;
	},
	
	setSearchable: function(searchable) {
		this.config.searchable = searchable ? true : false;
		this.clearSearch();
		this.renderSearch();
		return this;
	},
	
	setPaging: function(paging) {
		if (typeof paging === 'object') {
			if (paging.navSpan === undefined)
				paging.navSpan = 3;
			
			if (!(paging.allPageSizes instanceof Array))
				paging.allPageSizes = undefined;
			
			this.config.paging = {
				pageSize: paging.pageSize || 10,
				navSpan: paging.navSpan,
				allPageSizes: paging.allPageSizes
			};
		}
		else {
			this.config.paging = undefined;
		}
		this._pushPopFlags('paging');
		return this;
	},
	
	setPageSize: function(pageSize) {
		if (typeof this.config.paging === 'object')
			this.config.paging.pageSize = pageSize || 10;
		
		this._pushPopFlags('paging');
		return this;
	},
	
	searchAgain: function() {
		this.search(this.state.currentSearch || '');
	},
	clearSearch: function() {
		this.search('');
	},
	search: function(term) {
		var cfg = this.config,
			items = this.items,
			columns = cfg.columns;
		
		this.state.currentSearch = term;
		
		if (term === '') {
			this.itemsView = items;
		}
		else {
			term = term.toLowerCase();
			
			var itemsView = [];
			for (var i=0; i<items.length; i++) {
				var item = items[i];
				for (var j=0; j<columns.length; j++) {
					var column = columns[j];
					if (column.searchable) {
						if (column.search) {
							var value = column.search(item, null, column, i).toString().toLowerCase();
							if (value.indexOf(term) >= 0) {
								itemsView.push(item);
								break;
							}
						}
						else if (column.field) {
							var value = item[column.field];
							if (value !== null && value !== undefined) {
								value = value.toString().toLowerCase();
								if (value.indexOf(term) >= 0) {
									itemsView.push(item);
									break;
								}
							}
						}
					}
				}
			}
			
			this.itemsView = itemsView;
		}
		
		this._pushFlags('sort', 'paging', 'render');
		this.firstPage();
		this._popFlags();
	},
	
	sort: function(columnIndex) {
		var state = this.state,
			lastSort = state.lastSort;
		
		if (lastSort === undefined || lastSort.column !== columnIndex)
			lastSort = { column: columnIndex, asc: true };
		else if (lastSort.asc)
			lastSort = { column: columnIndex, asc: false };
		else
			lastSort = undefined;
		
		state.lastSort = lastSort;
		
		this._sort();
	},
	sortAgain: function() {
		this._sort();
	},
	_sort: function() {
		var state = this.state,
			lastSort = state.lastSort;
		
		if (lastSort) {
			var column = this.config.columns[lastSort.column];
			
			var comp = (function() {
				if (column.sort)
					return column.sort;
				
				if (column.field)
					return function(itemA, itemB) {
						var a = itemA[column.field];
						var b = itemB[column.field];
						
						if (!a) a = 0;
						if (!b) b = 0;
						
						if (typeof a === 'object' && a instanceof Date) a = a.getTime();
						if (typeof b === 'object' && b instanceof Date) b = b.getTime();
						
						if (typeof a === 'number' && isNaN(a)) a = 0;
						if (typeof b === 'number' && isNaN(b)) b = 0;
						
						if (typeof a === 'number' && typeof b === 'number')
							return a - b;
						
						if (typeof a === 'string' || typeof b === 'string')
							return a < b ? -1 : (a > b ? 1 : 0);
						
						return 0;
					};
				else
					return function(a, b) {
						return 0;
					};
			})();
			
			function asc(a, b) { return comp(a, b); }
			function desc(a, b) { return comp(b, a); }
			
			this.itemsView.sort(lastSort.asc ? asc : desc);
		}
		this._pushFlags('render');
		this.firstPage();
		this._popFlags();
	},
	
	gotoPage: function(page) {
		this.state.currentPage = Math.max(0, Math.min(this.getLastPageIndex(), page));
		this._pushPopFlags('render');
	},
	firstPage: function() { this.gotoPage(0); },
	lastPage: function() { this.gotoPage(this.getLastPageIndex()); },
	prevPage: function() { this.gotoPage(this.getCurrentPage() - 1); },
	nextPage: function() { this.gotoPage(this.getCurrentPage() + 1); },
	refreshPage: function() { this.gotoPage(this.getCurrentPage()); },
	
	getCurrentPage: function() {
		return this.state.currentPage || 0;
	},
	getPageSize: function() {
		if (this.config.paging)
			return this.config.paging.pageSize;
		
		return this.itemsView.length;
	},
	getLastPageIndex: function() {
		var cfg = this.config,
			items = this.itemsView,
			paging = cfg.paging;
		
		if (!paging)
			return 0;
		
		if (items.length === 0)
			return 0;
		
		var pageSize = this.getPageSize();
		var numPages = Math.ceil(items.length / pageSize);
		
		return (numPages - 1);
	},
	renderColumnHeaders: function() {
		var that = this,
			view = this.view,
			cfg = this.config,
			state = this.state,
			thead = view.tHead,
			columns = cfg.columns,
			lastSort = state.lastSort;
		
		thead.innerHTML = '';
		
		var i, row, cell, link, label, sortable;
		
		row = thead.insertRow();
		for (i=0; i<columns.length; i++) {
			(function(index) {
				var column = columns[index];
				cell = row.appendChild(document.createElement('th'));
				
				if (column.label)
					label = column.label;
				else if (column.field)
					label = better.utils.titleize(column.field);
				
				sortable = cfg.sortable;
				if (column.sortable !== undefined)
					sortable = column.sortable;
				sortable = sortable ? true : false;
				
				if (sortable) {
					cell.setAttribute('class', 'b-sortable');
					link = cell.appendChild(document.createElement('a'));
					link.setAttribute('href', 'javascript:void(0);');
					link.addEventListener('click', function() {
						that.sort(column.index);
					});
					if (lastSort && lastSort.column === column.index) {
						cell.setAttribute('class', lastSort.asc ? 'b-sortable b-asc' : 'b-sortable b-desc');
					}
					link.innerHTML = label;
				}
				else {
					cell.innerHTML = label;
				}
			})(i);
		}
	},
	renderInfo: function() {
		var view = this.view,
			state = this.state,
			items = this.itemsView,
			firstItem = state.firstItem,
			lastItem = state.lastItem;
		
		var str = '',
			showingAllItems = (lastItem - firstItem + 1 === items.length),
			showingOneItem = (lastItem === firstItem);
		
		firstItem++;
		lastItem++;
		
		if (showingAllItems) {
			str = 'Showing '+items.length+' '+(showingOneItem ? 'record' : 'records')+'.';
		}
		else {
			if (showingOneItem) {
				str = 'Showing record '+firstItem+' of '+items.length+'.';
			}
			else {
				str = 'Showing records '+firstItem+' to '+lastItem+' of '+items.length+'.';
			}
		}
		view.info.innerHTML = str;
	},
	renderSearch: function() {
		var that = this,
			view = this.view,
			cfg = this.config,
			state = this.state,
			searchable = cfg.searchable;
		
		if (searchable) {
			this._showView(view.search);
			
			var currentSearch = state.currentSearch;
			
			if (currentSearch === undefined)
				currentSearch = '';
			
			view.searchInput.value = currentSearch;
		}
		else {
			this._hideView(view.search);
		}
	},
	renderPager: function() {
		var that = this,
			cfg = this.config,
			view = this.view,
			paging = cfg.paging;
		
		if (paging) {
			this._showView(view.pager);
			
			var allSizes = paging.allPageSizes;
			
			if (allSizes) {
				this._showView(view.pageSizes);
				
				view.pageSizes.innerHTML = '';
				var select = view.pageSizes.appendChild(document.createElement('select'));
				
				for (var i=0; i<allSizes.length; i++) {
					var size = allSizes[i];
					var opt = select.appendChild(document.createElement('option'));
					opt.value = size;
					opt.innerHTML = size+' Per Page';
					
					if (size === paging.pageSize)
						select.selectedIndex = i;
				}
				select.addEventListener('change', function() {
					that.setPageSize(select.options[select.selectedIndex].value*1);
				});
			}
			else {
				this._hideView(view.pageSizes);
			}
			
			view.pager.innerHTML = '';
			
			var page = this.getCurrentPage();
			var firstPage = 0;
			var lastPage = this.getLastPageIndex();
			var navSpan = paging.navSpan;
			
			firstPage = Math.max(firstPage, page - navSpan);
			lastPage = Math.min(lastPage, page + navSpan);
			
			function btn(content, action) {
				var elem = view.pager.appendChild(document.createElement('a'));
				elem.addEventListener('click', function(e) { action(); });
				elem.setAttribute('href', 'javascript:void(0);');
				elem.innerHTML = content;
				return elem;
			}
			
			btn('<<', this.firstPage.bind(this)).setAttribute('class', 'b-first');
			btn('<', this.prevPage.bind(this)).setAttribute('class', 'b-prev');
			
			for (var i=firstPage; i<=lastPage; i++) {
				var e = btn(i+1, this.gotoPage.bind(this, i));
				if (i === page)
					e.setAttribute('class', 'b-active');
			}
			
			btn('>', this.nextPage.bind(this)).setAttribute('class', 'b-next');
			btn('>>', this.lastPage.bind(this)).setAttribute('class', 'b-last');
		}
		else {
			this._hideView(view.pager);
			this._hideView(view.pageSizes);
		}
	},
	renderItems: function() {
		var cfg = this.config,
			view = this.view,
			state = this.state,
			items = this.itemsView,
			columns = cfg.columns,
			tbody = view.tBody,
			first = state.firstItem,
			last = state.lastItem;
		
		tbody.innerHTML = '';
		
		var i, j, column, row, cell, item, content;
		
		for (i=first; i<=last; i++) {
			item = items[i];
			row = tbody.insertRow();
			for (j=0; j<columns.length; j++) {
				column = columns[j];
				cell = row.insertCell();
				
				if (column.field) {
					content = item[column.field];
					
					if (content === undefined || content === null)
						content = '';
					
					cell.innerHTML = content;
				}
				if (column.render) {
					content = column.render(item, cell, column, i);
					if (content !== undefined) {
						if (typeof content === 'string')
							cell.innerHTML = content;
						else if (content instanceof Element)
							cell.appendChild(content);
					}
				}
			}
		}
	},
	render: function() {
		if (this.config.columns)
			this._render();
	},
	_render: function() {
		var state = this.state,
			items = this.itemsView;
		
		var page = this.getCurrentPage();
		var pageSize = this.getPageSize();
		state.firstItem = Math.max(0, page * pageSize);
		state.lastItem = Math.min(items.length-1, (page+1) * pageSize - 1);
		
		this.renderSearch();
		this.renderColumnHeaders();
		this.renderInfo();
		this.renderPager();
		this.renderItems();
	}
});
})();