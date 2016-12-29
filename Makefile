.PHONY: coverage

test:
	./node_modules/jasme/run.js ./test.js
lint:
	node_modules/eslint/bin/eslint.js index.js
coverage:
	node_modules/istanbul/lib/cli.js cover \
		-i './index.js' \
		--include-all-sources \
		--dir coverage \
		./node_modules/jasme/run.js -- \
			--output=coverage \
			./test.js

coveralls: coverage
ifndef COVERALLS_REPO_TOKEN
	$(error COVERALLS_REPO_TOKEN is undefined)
endif
	node_modules/coveralls/bin/coveralls.js < coverage/lcov.info
