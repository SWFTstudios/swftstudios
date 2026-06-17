(function () {
  'use strict';

  var list = document.querySelector('.gallery_list');
  if (!list) return;

  var items = Array.prototype.slice.call(list.querySelectorAll('.gallery_item'));
  var filterButtons = Array.prototype.slice.call(document.querySelectorAll('.work-filter-btn'));
  var sortSelect = document.getElementById('work-sort-select');
  var activeFilter = 'all';

  function getVisibleItems() {
    return items.filter(function (item) {
      if (activeFilter === 'all') return true;
      return item.getAttribute('data-category') === activeFilter;
    });
  }

  function applySort() {
    var sortValue = sortSelect ? sortSelect.value : 'featured';
    var visible = getVisibleItems();

    visible.sort(function (a, b) {
      if (sortValue === 'featured') {
        return Number(a.getAttribute('data-order')) - Number(b.getAttribute('data-order'));
      }
      var nameA = (a.getAttribute('data-name') || '').toLowerCase();
      var nameB = (b.getAttribute('data-name') || '').toLowerCase();
      if (sortValue === 'name-asc') return nameA.localeCompare(nameB);
      if (sortValue === 'name-desc') return nameB.localeCompare(nameA);
      return 0;
    });

    visible.forEach(function (item, index) {
      item.style.order = String(index + 1);
      list.appendChild(item);
    });
  }

  function applyFilter(category) {
    activeFilter = category;
    list.classList.add('is-filtered');

    filterButtons.forEach(function (btn) {
      var isActive = btn.getAttribute('data-filter') === category;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    items.forEach(function (item) {
      var match = category === 'all' || item.getAttribute('data-category') === category;
      item.classList.toggle('is-hidden', !match);
      item.style.display = match ? '' : 'none';
    });

    applySort();
  }

  filterButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyFilter(btn.getAttribute('data-filter') || 'all');
    });
  });

  if (sortSelect) {
    sortSelect.addEventListener('change', applySort);
  }

  applyFilter('all');
})();
