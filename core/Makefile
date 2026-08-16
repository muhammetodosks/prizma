# Prizma — C++ motor Makefile (native build + test)
CXX ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -Wno-unused-parameter

SRC = src/filter.cpp src/pattern.cpp src/index.cpp src/engine.cpp src/guard.cpp
TEST_SRC = tests/test_engine.cpp

.PHONY: all test wasm clean

all: test

test: build/test_engine
	./build/test_engine

build/test_engine: $(SRC) $(TEST_SRC) | build
	$(CXX) $(CXXFLAGS) -o $@ $(TEST_SRC) $(SRC)

build:
	mkdir -p build

clean:
	rm -rf build