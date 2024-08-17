<script lang="ts">
	let value = '';
</script>

<div class="counter">
	<input type="text" {value} />
</div>

<style>
	.counter {
		display: flex;
		border-top: 1px solid rgba(0, 0, 0, 0.1);
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
		margin: 1rem 0;
	}
</style>
