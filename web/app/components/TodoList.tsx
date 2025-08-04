import { CheckSquare, Square, Clock, AlertCircle, ListTodo } from 'lucide-react';

interface Todo {
  task?: string;
  description?: string;
  content?: string;
  title?: string;
  text?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed';
  [key: string]: any; // Allow other properties
}

interface TodoListProps {
  todos: Todo[];
}

export function TodoList({ todos }: TodoListProps) {
  if (!todos || todos.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
        <ListTodo className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-600">No tasks in the todo list</p>
      </div>
    );
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low':
        return 'text-green-600 bg-green-50 border-green-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckSquare className="w-4 h-4 text-green-600" />;
      case 'in_progress':
        return <Clock className="w-4 h-4 text-blue-600 animate-pulse" />;
      case 'pending':
        return <Square className="w-4 h-4 text-gray-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 border-green-200';
      case 'in_progress':
        return 'bg-blue-50 border-blue-200';
      case 'pending':
        return 'bg-gray-50 border-gray-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  // Group todos by status
  const groupedTodos = {
    in_progress: todos.filter(t => t.status === 'in_progress'),
    pending: todos.filter(t => t.status === 'pending'),
    completed: todos.filter(t => t.status === 'completed')
  };

  return (
    <div className="space-y-3">
      {/* Summary stats */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <ListTodo className="w-4 h-4 text-indigo-600" />
          <span className="text-sm font-semibold text-gray-900">Todo List</span>
        </div>
        <div className="flex items-center space-x-2 text-xs">
          {groupedTodos.in_progress.length > 0 && (
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full border border-blue-200">
              {groupedTodos.in_progress.length} in progress
            </span>
          )}
          {groupedTodos.pending.length > 0 && (
            <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full border border-gray-200">
              {groupedTodos.pending.length} pending
            </span>
          )}
          {groupedTodos.completed.length > 0 && (
            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full border border-green-200">
              {groupedTodos.completed.length} completed
            </span>
          )}
        </div>
      </div>

      {/* Todo items */}
      <div className="space-y-2">
        {/* In Progress items first */}
        {groupedTodos.in_progress.map((todo, index) => (
          <TodoItem key={`in-progress-${index}`} todo={todo} />
        ))}
        
        {/* Pending items */}
        {groupedTodos.pending.map((todo, index) => (
          <TodoItem key={`pending-${index}`} todo={todo} />
        ))}
        
        {/* Completed items last */}
        {groupedTodos.completed.map((todo, index) => (
          <TodoItem key={`completed-${index}`} todo={todo} />
        ))}
      </div>
    </div>
  );
}

function TodoItem({ todo }: { todo: Todo }) {
  // Get the task text from various possible property names
  const getTaskText = (todo: Todo): string => {
    return todo.task || todo.description || todo.content || todo.title || todo.text || 
           Object.entries(todo).find(([key, value]) => 
             typeof value === 'string' && 
             !['priority', 'status'].includes(key)
           )?.[1] || 
           'No task description';
  };

  const taskText = getTaskText(todo);
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low':
        return 'text-green-600 bg-green-50 border-green-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckSquare className="w-4 h-4 text-green-600" />;
      case 'in_progress':
        return <Clock className="w-4 h-4 text-blue-600 animate-pulse" />;
      case 'pending':
        return <Square className="w-4 h-4 text-gray-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 border-green-200';
      case 'in_progress':
        return 'bg-blue-50 border-blue-200';
      case 'pending':
        return 'bg-gray-50 border-gray-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className={`flex items-start space-x-3 p-3 rounded-lg border ${getStatusColor(todo.status)} transition-all duration-200`}>
      <div className="flex-shrink-0 mt-0.5">
        {getStatusIcon(todo.status)}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${todo.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
          {taskText}
        </p>
      </div>
      <div className="flex-shrink-0">
        <span className={`text-xs px-2 py-1 rounded-full border font-medium ${getPriorityColor(todo.priority)}`}>
          {todo.priority}
        </span>
      </div>
    </div>
  );
}