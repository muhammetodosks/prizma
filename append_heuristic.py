with open('core/src/engine.cpp', 'r') as f:
    content = f.read()

with open('heuristic_impl.cpp', 'r') as f:
    heuristic_impl = f.read()

# Remove trailing newlines and add heuristic impl before namespace closing
content = content.rstrip() + '\n\n' + heuristic_impl + '\n}  // namespace prizma\n'

with open('core/src/engine.cpp', 'w') as f:
    f.write(content)

print("Fixed engine.cpp")